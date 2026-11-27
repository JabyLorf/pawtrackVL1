import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bell,
  Check,
  Flag,
  Info,
  Loader2,
  LogOut,
  MessageSquarePlus,
  Pencil,
  Search,
  Send,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ago } from '../lib/utils'
import type { Person } from '../types'
import { PublicLayout } from '../components/PublicLayout'
import { Modal } from '../components/Modal'
import { Avatar } from '../components/Avatar'
import { useConfirm } from '../components/ConfirmDialog'
import { friendly, Name, Toast } from '../components/CommunityUi'
import { ReportDialog } from '../components/ReportDialog'
import { refreshUnread } from '../components/useUnread'

// ---- shared -------------------------------------------------------------------

/** Shown instead of the page when nobody is signed in. */
function SignInFirst({ what }: { what: string }) {
  const navigate = useNavigate()
  return (
    <div className="empty panel feed-empty">
      <p>Sign in to see your {what}.</p>
      <button className="btn btn-primary" type="button" onClick={() => navigate(`/join?next=${encodeURIComponent(window.location.pathname)}`)}>Sign in</button>
    </div>
  )
}

// ---- notifications --------------------------------------------------------------

type Note = {
  id: string
  kind: 'like' | 'comment' | 'follow' | 'reply' | 'repost'
  created_at: string
  is_read: boolean
  actor_id: string
  username: string
  display_name: string
  avatar_url: string
  is_shelter: boolean
  post_id: string | null
  post_photo: string | null
  post_text: string | null
  comment_text: string | null
  followed_back: boolean
}

export function NotificationsPage() {
  const { canPost, loading } = useAuth()
  const navigate = useNavigate()
  const [notes, setNotes] = useState<Note[] | null>(null)

  useEffect(() => {
    if (!canPost) return
    supabase.rpc('my_notifications', { p_limit: 60 }).then(async ({ data }) => {
      setNotes((data as Note[]) || [])
      // Keep the "new" highlight on screen, but count them as read.
      await supabase.rpc('mark_notifications_read')
      refreshUnread()
    })
  }, [canPost])

  async function followBack(n: Note) {
    const { error } = await supabase.from('follows').insert({ following_id: n.actor_id })
    if (!error || /duplicate/i.test(error.message)) {
      setNotes((list) => (list || []).map((x) => (x.actor_id === n.actor_id ? { ...x, followed_back: true } : x)))
    }
  }

  return (
    <PublicLayout noFooter>
      <section className="block community">
        <div className="feed-wrap">
          <div className="feed-top"><div><p className="kicker">Community</p><h2>Notifications</h2></div></div>
          {!loading && !canPost ? <SignInFirst what="notifications" /> : notes === null ? (
            <p className="empty"><Loader2 size={18} className="spin" /> Loading…</p>
          ) : notes.length === 0 ? (
            <div className="empty panel feed-empty">
              <Bell size={26} />
              <p>When people like your posts, comment, or follow you, you'll see it here.</p>
            </div>
          ) : (
            <div className="panel note-list">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className={'note clickable' + (n.is_read ? '' : ' unread')}
                  role="link"
                  tabIndex={0}
                  // Tapping anywhere opens the post (or the person, for a follow).
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a, button')) return
                    navigate(n.kind === 'follow' || !n.post_id ? `/community/u/${n.username}` : `/community/p/${n.post_id}`)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(n.kind === 'follow' || !n.post_id ? `/community/u/${n.username}` : `/community/p/${n.post_id}`)
                  }}
                >
                  <Link to={`/community/u/${n.username}`}><Avatar src={n.avatar_url} name={n.display_name} size={40} /></Link>
                  <p className="note-text">
                    <Name p={n} />{' '}
                    {n.kind === 'like' ? 'liked your post.' : n.kind === 'repost' ? 'reposted your post.' : n.kind === 'follow' ? 'started following you.' : n.kind === 'reply' ? (
                      <>replied to your comment: <span className="note-quote">"{n.comment_text}"</span></>
                    ) : (
                      <>commented: <span className="note-quote">"{n.comment_text}"</span></>
                    )}
                    <small> {ago(n.created_at)}</small>
                  </p>
                  {n.kind === 'follow' ? (
                    n.followed_back ? <span className="btn btn-light btn-sm disabled-look"><Check size={14} /> Following</span> : (
                      <button className="btn btn-primary btn-sm" type="button" onClick={() => followBack(n)}><UserPlus size={14} /> Follow back</button>
                    )
                  ) : n.post_id ? (
                    <Link className="note-thumb" to={`/community/p/${n.post_id}`} aria-label="Open post">
                      {n.post_photo ? <img src={n.post_photo} alt="" /> : <span>{(n.post_text || '').slice(0, 30)}</span>}
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  )
}

// ---- people picker (new chat / new group / add people) -----------------------

function PeoplePicker({ title, multi, exclude = [], groupName, busyLabel, onPick, onClose }: {
  title: string
  multi: boolean
  exclude?: string[]
  /** Show a group-name field (new group). */
  groupName?: boolean
  busyLabel: string
  onPick: (people: Person[], name: string) => Promise<string | null>
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [picked, setPicked] = useState<Person[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const term = q.trim()
    if (!term) { setResults([]); return }
    const t = setTimeout(() => {
      supabase.rpc('community_search', { p_q: term }).then(({ data }) => setResults(((data as Person[]) || []).filter((p) => !exclude.includes(p.id))))
    }, 250)
    return () => clearTimeout(t)
  }, [q, exclude])

  async function go(list: Person[]) {
    setError('')
    if (groupName && !name.trim()) { setError('Give the group a name.'); return }
    if (!list.length) { setError(multi ? 'Choose at least one person.' : 'Choose someone.'); return }
    setBusy(true)
    const err = await onPick(list, name.trim())
    setBusy(false)
    if (err) setError(err)
  }

  function toggle(p: Person) {
    if (!multi) { go([p]); return }
    setPicked((list) => (list.some((x) => x.id === p.id) ? list.filter((x) => x.id !== p.id) : [...list, p]))
  }

  return createPortal(
    <Modal onClose={() => { if (!busy) onClose() }}>
      <div className="dialog picker">
        <div className="people-head">
          <h2>{title}</h2>
          <button className="icon-btn" type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {groupName ? (
          <>
            <label htmlFor="group-name">Group name</label>
            <input id="group-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekend dog walkers" />
          </>
        ) : null}
        {multi && picked.length ? (
          <div className="chips">
            {picked.map((p) => (
              <button key={p.id} className="chip" type="button" onClick={() => toggle(p)}>{p.display_name} <X size={12} /></button>
            ))}
          </div>
        ) : null}
        <div className="search-box">
          <Search size={16} />
          <input autoFocus placeholder="Search by name or username" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="picker-results">
          {q.trim() && results.length === 0 ? <p className="muted">No one found.</p> : null}
          {results.map((p) => {
            const on = picked.some((x) => x.id === p.id)
            return (
              <button key={p.id} type="button" className={'who-row' + (on ? ' on' : '')} onClick={() => toggle(p)} disabled={busy}>
                <Avatar src={p.avatar_url} name={p.display_name} size={38} />
                <span><Name p={p} link={false} /><small>@{p.username}</small></span>
                {multi ? <span className={'tick' + (on ? ' on' : '')}>{on ? <Check size={14} /> : null}</span> : null}
              </button>
            )
          })}
        </div>
        {error ? <p className="err">{error}</p> : null}
        {multi ? (
          <div className="dialog-actions">
            <button className="btn btn-light" type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" type="button" onClick={() => go(picked)} disabled={busy}>
              {busy ? <><Loader2 size={16} className="spin" /> {busyLabel}</> : groupName ? 'Create group' : 'Add'}
            </button>
          </div>
        ) : busy ? <p className="muted"><Loader2 size={16} className="spin" /> {busyLabel}</p> : null}
      </div>
    </Modal>,
    document.body,
  )
}

// ---- inbox ----------------------------------------------------------------------

type Chat = {
  id: string
  is_group: boolean
  title: string
  member_count: number
  other_id: string | null
  other_username: string | null
  other_name: string | null
  other_avatar: string | null
  other_is_shelter: boolean | null
  last_body: string | null
  last_kind: string | null
  last_sender: string | null
  last_at: string
  unread: number
}

export function MessagesPage() {
  const { canPost, loading, profile } = useAuth()
  const navigate = useNavigate()
  const [chats, setChats] = useState<Chat[] | null>(null)
  const [picker, setPicker] = useState<'dm' | 'group' | null>(null)

  const load = useCallback(() => {
    supabase.rpc('my_conversations').then(({ data }) => setChats((data as Chat[]) || []))
  }, [])

  useEffect(() => {
    if (!canPost) return
    load()
    const t = setInterval(load, 20000)
    return () => clearInterval(t)
  }, [canPost, load])

  const preview = (c: Chat) => {
    if (!c.last_body) return c.is_group ? `${c.member_count} members` : 'Say hi!'
    if (c.last_kind === 'system') return c.last_body
    if (c.last_kind === 'post') {
      const who = c.last_sender === profile?.display_name ? 'You' : (c.last_sender || '').split(' ')[0]
      return `${who} shared a post`
    }
    const who = c.last_sender === profile?.display_name ? 'You' : c.is_group ? (c.last_sender || '').split(' ')[0] : ''
    return who ? `${who}: ${c.last_body}` : c.last_body
  }

  return (
    <PublicLayout noFooter>
      <section className="block community">
        <div className="feed-wrap">
          <div className="feed-top">
            <div><p className="kicker">Community</p><h2>Messages</h2></div>
            {canPost ? (
              <div className="row-gap feed-actions">
                <button className="btn btn-light btn-sm" type="button" onClick={() => setPicker('group')}><Users size={16} /> New group</button>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => setPicker('dm')}><MessageSquarePlus size={16} /> New message</button>
              </div>
            ) : null}
          </div>
          {!loading && !canPost ? <SignInFirst what="messages" /> : chats === null ? (
            <p className="empty"><Loader2 size={18} className="spin" /> Loading…</p>
          ) : chats.length === 0 ? (
            <div className="empty panel feed-empty">
              <MessageSquarePlus size={26} />
              <p>No messages yet. Start a chat with someone, or make a group.</p>
            </div>
          ) : (
            <div className="panel chat-list">
              {chats.map((c) => (
                <Link key={c.id} className={'chat-row' + (c.unread ? ' unread' : '')} to={`/messages/${c.id}`}>
                  {c.is_group ? <span className="avatar group-avatar" style={{ width: 46, height: 46 }}><Users size={20} /></span> : (
                    <Avatar src={c.other_avatar || ''} name={c.other_name || '?'} size={46} />
                  )}
                  <span className="chat-row-main">
                    <span className="chat-row-top">
                      <b>{c.is_group ? c.title : c.other_name || 'Unknown'}</b>
                      <small>{ago(c.last_at)}</small>
                    </span>
                    <span className="chat-row-last">{preview(c)}</span>
                  </span>
                  {c.unread ? <span className="badge-count">{c.unread > 99 ? '99+' : c.unread}</span> : null}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
      {picker === 'dm' ? (
        <PeoplePicker
          title="New message"
          multi={false}
          busyLabel="Opening chat…"
          onClose={() => setPicker(null)}
          onPick={async ([p]) => {
            const { data, error } = await supabase.rpc('start_dm', { p_user: p.id })
            if (error) return error.message
            navigate(`/messages/${data}`)
            return null
          }}
        />
      ) : picker === 'group' ? (
        <PeoplePicker
          title="New group"
          multi
          groupName
          busyLabel="Creating…"
          onClose={() => setPicker(null)}
          onPick={async (people, name) => {
            const { data, error } = await supabase.rpc('create_group', { p_title: name, p_members: people.map((p) => p.id) })
            if (error) return error.message
            navigate(`/messages/${data}`)
            return null
          }}
        />
      ) : null}
    </PublicLayout>
  )
}

// ---- one chat ---------------------------------------------------------------------

type Msg = {
  id: string
  body: string
  kind: 'text' | 'system' | 'post'
  created_at: string
  sender_id: string | null
  username: string | null
  display_name: string | null
  avatar_url: string | null
  // A shared Community post (kind 'post'); empty if the post was deleted.
  post_id?: string | null
  post_photo?: string | null
  post_body?: string | null
  post_username?: string | null
  post_display_name?: string | null
  post_avatar?: string | null
}
type Member = Person & { is_admin: boolean }
type Conv = { id: string; is_group: boolean; title: string }

function time(iso: string) {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function ChatPage() {
  const { id = '' } = useParams()
  const { profile, canPost, loading } = useAuth()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()
  const [conv, setConv] = useState<Conv | null>(null)
  const [missing, setMissing] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [older, setOlder] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState(false)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [report, setReport] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const me = profile?.id
  const others = members.filter((m) => m.id !== me)
  const amAdmin = members.some((m) => m.id === me && m.is_admin)
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  const markRead = useCallback(async () => {
    if (!me) return
    await supabase.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', id).eq('user_id', me)
    refreshUnread()
  }, [id, me])

  const loadMembers = useCallback(async () => {
    const { data } = await supabase.rpc('chat_members', { p_conv: id })
    setMembers((data as Member[]) || [])
  }, [id])

  // Adds rows, skipping ones already shown, in time order.
  const merge = useCallback((rows: Msg[]) => {
    setMsgs((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]))
      rows.forEach((r) => map.set(r.id, r))
      return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
    })
  }, [])

  const loadLatest = useCallback(async () => {
    const { data } = await supabase.rpc('chat_messages', { p_conv: id, p_limit: 50 })
    return (data as Msg[]) || []
  }, [id])

  useEffect(() => {
    if (!canPost) return
    let alive = true
    setMsgs([])
    setConv(null)
    setMissing(false)
    supabase.from('conversations').select('id, is_group, title').eq('id', id).maybeSingle().then(({ data }) => {
      if (!alive) return
      if (!data) { setMissing(true); return }
      setConv(data as Conv)
    })
    loadMembers()
    loadLatest().then((rows) => {
      if (!alive) return
      merge(rows)
      setOlder(rows.length === 50)
      stick.current = true
      markRead()
    })

    // Live: new messages appear straight away. A slow poll covers dropped connections.
    const channel = supabase
      .channel(`chat-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, () => {
        loadLatest().then((rows) => { if (alive) { merge(rows); markRead() } })
        if (alive) loadMembers()
      })
      .subscribe()
    const poll = setInterval(() => loadLatest().then((rows) => { if (alive) merge(rows) }), 15000)
    return () => {
      alive = false
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [id, canPost, loadLatest, loadMembers, merge, markRead])

  useEffect(() => {
    if (stick.current) end.current?.scrollIntoView({ block: 'end' })
  }, [msgs])

  async function loadOlder() {
    const first = msgs[0]
    if (!first) return
    stick.current = false
    const { data } = await supabase.rpc('chat_messages', { p_conv: id, p_before: first.created_at, p_limit: 50 })
    const rows = (data as Msg[]) || []
    merge(rows)
    setOlder(rows.length === 50)
  }

  async function send(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || sending || !me) return
    setSending(true)
    setError('')
    const { data, error: err } = await supabase.from('messages').insert({ conversation_id: id, sender_id: me, body }).select('id, body, kind, created_at, sender_id').single()
    setSending(false)
    if (err) { setError(friendly(err.message)); return }
    setText('')
    stick.current = true
    merge([{ ...(data as Msg), username: profile!.username, display_name: profile!.display_name, avatar_url: profile!.avatar_url || '' }])
  }

  const title = conv?.is_group ? conv.title : others[0]?.display_name || 'Chat'

  if (!loading && !canPost) {
    return <PublicLayout noFooter><section className="block community"><div className="feed-wrap"><SignInFirst what="messages" /></div></section></PublicLayout>
  }

  return (
    <PublicLayout noFooter>
      <section className="chat-page">
        <div className="chat-shell">
          <header className="chat-head">
            <button className="icon-btn" type="button" aria-label="Back to messages" onClick={() => navigate('/messages')}><ArrowLeft size={19} /></button>
            {conv?.is_group ? (
              <span className="avatar group-avatar" style={{ width: 38, height: 38 }}><Users size={18} /></span>
            ) : others[0] ? (
              <Link to={`/community/u/${others[0].username}`}><Avatar src={others[0].avatar_url} name={others[0].display_name} size={38} /></Link>
            ) : <Avatar name="?" size={38} />}
            <div className="chat-title">
              {conv?.is_group ? <b>{title}</b> : others[0] ? <Name p={others[0]} /> : <b>{title}</b>}
              <small>{conv?.is_group ? `${members.length} members` : others[0] ? `@${others[0].username}` : ''}</small>
            </div>
            {conv?.is_group ? (
              <button className="icon-btn" type="button" aria-label="Group info" onClick={() => setInfo(true)}><Info size={19} /></button>
            ) : null}
          </header>

          <div className="chat-body">
            {missing ? <p className="empty center-text">This chat doesn't exist or you're no longer in it.</p> : null}
            {older ? <button className="link center-link" type="button" onClick={loadOlder}>Load earlier messages</button> : null}
            {msgs.map((m, i) => {
              if (m.kind === 'system') return <p key={m.id} className="cmsg-system">{m.body}</p>
              const mine = m.sender_id === me
              const prev = msgs[i - 1]
              const sameRun = prev && prev.kind === 'text' && prev.sender_id === m.sender_id &&
                new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000
              const who = (m.sender_id && byId.get(m.sender_id)) || null
              return (
                <div key={m.id} className={'cmsg' + (mine ? ' mine' : '') + (sameRun ? ' run' : '')}>
                  {!mine ? (
                    <span className="cmsg-avatar">{!sameRun ? <Avatar src={m.avatar_url || who?.avatar_url || ''} name={m.display_name || who?.display_name || '?'} size={28} /> : null}</span>
                  ) : null}
                  <div className="cmsg-col">
                    {!mine && conv?.is_group && !sameRun ? <small className="cmsg-name">{m.display_name || who?.display_name || 'Former member'}</small> : null}
                    <div className="bubble-row">
                      {m.kind === 'post' ? (
                        <div className="shared-post" title={time(m.created_at)}>
                          {m.post_id ? (
                            <Link to={`/community/p/${m.post_id}`} className="shared-card">
                              <span className="shared-head">
                                <Avatar src={m.post_avatar || ''} name={m.post_display_name || '?'} size={22} />
                                <b>{m.post_display_name}</b>
                              </span>
                              {m.post_photo ? <img src={m.post_photo} alt="" /> : null}
                              {m.post_body ? <span className="shared-text">{m.post_body}</span> : null}
                            </Link>
                          ) : <span className="shared-card gone">This post is no longer available.</span>}
                          {m.body && m.body !== 'Shared a post' ? <p className="bubble">{m.body}</p> : null}
                        </div>
                      ) : <p className="bubble" title={time(m.created_at)}>{m.body}</p>}
                      {!mine ? (
                        <button className="cmsg-flag" type="button" aria-label="Report message" title="Report" onClick={() => setReport(m.id)}><Flag size={13} /></button>
                      ) : null}
                    </div>
                    {!msgs[i + 1] || msgs[i + 1].sender_id !== m.sender_id ? <small className="cmsg-time">{time(m.created_at)}</small> : null}
                  </div>
                </div>
              )
            })}
            <div ref={end} />
          </div>

          {!missing ? (
            <form className="chat-compose" onSubmit={send}>
              <textarea
                rows={1}
                maxLength={2000}
                placeholder="Message…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit() } }}
              />
              <button className="icon-btn brand" type="submit" disabled={!text.trim() || sending} aria-label="Send">
                {sending ? <Loader2 size={19} className="spin" /> : <Send size={19} />}
              </button>
            </form>
          ) : null}
          {error ? <p className="err chat-err">{error}</p> : null}
        </div>
      </section>

      {info && conv ? createPortal(
        <Modal onClose={() => setInfo(false)}>
          <div className="dialog people">
            <div className="people-head">
              <h2>{conv.title}</h2>
              <button className="icon-btn" type="button" aria-label="Close" onClick={() => setInfo(false)}><X size={18} /></button>
            </div>
            <div className="row-gap wrap">
              <button className="btn btn-light btn-sm" type="button" onClick={() => setAdding(true)}><UserPlus size={15} /> Add people</button>
              <button className="btn btn-light btn-sm" type="button" onClick={() => setRenaming(true)}><Pencil size={15} /> Rename</button>
            </div>
            <p className="muted small">{members.length} members</p>
            {members.map((m) => (
              <div key={m.id} className="who-row static">
                <Link to={`/community/u/${m.username}`} onClick={() => setInfo(false)}><Avatar src={m.avatar_url} name={m.display_name} size={38} /></Link>
                <span><Name p={m} /><small>@{m.username}{m.is_admin ? ' · Group admin' : ''}{m.id === me ? ' · You' : ''}</small></span>
                {amAdmin && m.id !== me ? (
                  <button className="icon-btn sm" type="button" aria-label={`Remove ${m.display_name}`} title="Remove from group" onClick={() => confirm({
                    title: `Remove ${m.display_name}?`,
                    body: `${m.display_name} will be removed from "${conv.title}" and won't see new messages.`,
                    confirmLabel: 'Remove',
                    danger: true,
                    action: async () => {
                      const { error: err } = await supabase.rpc('remove_group_member', { p_conv: id, p_user: m.id })
                      if (err) return err.message
                      await loadMembers()
                      return null
                    },
                  })}><UserMinus size={15} /></button>
                ) : null}
              </div>
            ))}
            <button className="btn btn-light btn-block danger-text" type="button" onClick={() => confirm({
              title: `Leave "${conv.title}"?`,
              body: "You'll stop getting messages from this group. Someone in it would need to add you back.",
              confirmLabel: 'Leave group',
              danger: true,
              action: async () => {
                const { error: err } = await supabase.rpc('leave_group', { p_conv: id })
                if (err) return err.message
                refreshUnread()
                navigate('/messages', { replace: true })
                return null
              },
            })}><LogOut size={16} /> Leave group</button>
          </div>
        </Modal>,
        document.body,
      ) : null}

      {adding ? (
        <PeoplePicker
          title="Add people"
          multi
          exclude={members.map((m) => m.id)}
          busyLabel="Adding…"
          onClose={() => setAdding(false)}
          onPick={async (people) => {
            const { error: err } = await supabase.rpc('add_group_members', { p_conv: id, p_members: people.map((p) => p.id) })
            if (err) return err.message
            setAdding(false)
            await loadMembers()
            setToast(`Added ${people.length === 1 ? people[0].display_name : `${people.length} people`}`)
            return null
          }}
        />
      ) : null}

      {renaming && conv ? (
        <RenameGroup
          current={conv.title}
          onClose={() => setRenaming(false)}
          onSave={async (t) => {
            const { error: err } = await supabase.rpc('rename_group', { p_conv: id, p_title: t })
            if (err) return err.message
            setConv({ ...conv, title: t })
            setRenaming(false)
            return null
          }}
        />
      ) : null}

      {report ? <ReportDialog kind="message" id={report} onClose={() => setReport(null)} /> : null}
      {dialog}
      <Toast text={toast} onDone={() => setToast('')} />
    </PublicLayout>
  )
}

function RenameGroup({ current, onClose, onSave }: { current: string; onClose: () => void; onSave: (t: string) => Promise<string | null> }) {
  const [t, setT] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return createPortal(
    <Modal onClose={() => { if (!busy) onClose() }}>
      <form
        className="dialog"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!t.trim()) { setError('Enter a name.'); return }
          setBusy(true)
          const err = await onSave(t.trim())
          setBusy(false)
          if (err) setError(err)
        }}
      >
        <h2>Rename group</h2>
        <p className="auth-sub">Everyone in the group will see the new name.</p>
        <input autoFocus maxLength={60} value={t} onChange={(e) => setT(e.target.value)} />
        {error ? <p className="err">{error}</p> : null}
        <div className="dialog-actions">
          <button className="btn btn-light" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save name'}</button>
        </div>
      </form>
    </Modal>,
    document.body,
  )
}
