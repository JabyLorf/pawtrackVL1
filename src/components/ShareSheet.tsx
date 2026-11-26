import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Link2, Loader2, Search, Send, Users, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Person, Post } from '../types'
import { Modal } from './Modal'
import { Avatar } from './Avatar'
import { Name, share } from './CommunityUi'

type ChatRow = {
  id: string
  is_group: boolean
  title: string
  other_id: string | null
  other_username: string | null
  other_name: string | null
  other_avatar: string | null
  other_is_shelter: boolean | null
}

// One row a post can be sent to: an existing chat, or a person (opens a 1:1 chat).
type Target = { key: string; chatId?: string; personId?: string; label: string; sub: string; avatar: string; group: boolean; person?: Person }

/** "Share" for signed-in members: send a post into PawTrack chats, or share it outside. */
export function ShareSheet({ post, onClose, onToast }: { post: Post; onClose: () => void; onToast: (text: string) => void }) {
  const [chats, setChats] = useState<Target[]>([])
  const [q, setQ] = useState('')
  const [people, setPeople] = useState<Target[]>([])
  const [note, setNote] = useState('')
  const [sent, setSent] = useState<Record<string, 'busy' | 'done' | string>>({})

  useEffect(() => {
    supabase.rpc('my_conversations').then(({ data }) => {
      setChats(((data as ChatRow[]) || []).slice(0, 12).map((c) => ({
        key: 'c' + c.id,
        chatId: c.id,
        label: c.is_group ? c.title : c.other_name || 'Chat',
        sub: c.is_group ? 'Group' : `@${c.other_username || ''}`,
        avatar: c.is_group ? '' : c.other_avatar || '',
        group: c.is_group,
        person: !c.is_group && c.other_id ? { id: c.other_id, username: c.other_username || '', display_name: c.other_name || '', avatar_url: c.other_avatar || '', is_shelter: !!c.other_is_shelter } : undefined,
      })))
    })
  }, [])

  useEffect(() => {
    const term = q.trim()
    if (!term) { setPeople([]); return }
    const t = setTimeout(() => {
      supabase.rpc('community_search', { p_q: term }).then(({ data }) => {
        setPeople(((data as Person[]) || []).map((p) => ({
          key: 'p' + p.id, personId: p.id, label: p.display_name, sub: `@${p.username}`, avatar: p.avatar_url, group: false, person: p,
        })))
      })
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  async function send(t: Target) {
    if (sent[t.key] === 'busy' || sent[t.key] === 'done') return
    setSent((s) => ({ ...s, [t.key]: 'busy' }))
    let chatId = t.chatId
    if (!chatId) {
      const { data, error } = await supabase.rpc('start_dm', { p_user: t.personId })
      if (error) { setSent((s) => ({ ...s, [t.key]: error.message })); return }
      chatId = data as string
    }
    const { data: auth } = await supabase.auth.getUser()
    const { error } = await supabase.from('messages').insert({
      conversation_id: chatId,
      sender_id: auth.user?.id,
      kind: 'post',
      post_id: post.id,
      body: note.trim() || 'Shared a post',
    })
    setSent((s) => ({ ...s, [t.key]: error ? error.message : 'done' }))
  }

  const term = q.trim().toLowerCase()
  const list = term
    ? [
        ...chats.filter((c) => c.label.toLowerCase().includes(term) || c.sub.toLowerCase().includes(term)),
        ...people.filter((p) => !chats.some((c) => c.person?.id === p.personId)),
      ]
    : chats

  return createPortal(
    <Modal onClose={onClose}>
      <div className="dialog share-sheet">
        <div className="people-head">
          <h2>Share</h2>
          <button className="icon-btn" type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="share-preview">
          {post.photo_url ? <img src={post.photo_url} alt="" /> : null}
          <div><b>{post.display_name}</b><p>{post.body || 'Photo'}</p></div>
        </div>
        <input maxLength={500} placeholder="Write a message (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="search-box">
          <Search size={16} />
          <input placeholder="Search people or chats" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="picker-results">
          {list.length === 0 ? <p className="muted">{term ? 'No one found.' : 'No chats yet. Search for someone to send it to.'}</p> : null}
          {list.map((t) => {
            const state = sent[t.key]
            return (
              <div key={t.key} className="who-row static">
                {t.group ? <span className="avatar group-avatar" style={{ width: 38, height: 38 }}><Users size={17} /></span> : <Avatar src={t.avatar} name={t.label} size={38} />}
                <span>
                  {t.person ? <Name p={t.person} link={false} /> : <b>{t.label}</b>}
                  <small>{state && state !== 'busy' && state !== 'done' ? <span className="err-inline">{state}</span> : t.sub}</small>
                </span>
                <button
                  className={'btn btn-sm ' + (state === 'done' ? 'btn-light' : 'btn-primary')}
                  type="button"
                  disabled={state === 'busy' || state === 'done'}
                  onClick={() => send(t)}
                >
                  {state === 'busy' ? <Loader2 size={14} className="spin" /> : state === 'done' ? <><Check size={14} /> Sent</> : <><Send size={14} /> Send</>}
                </button>
              </div>
            )
          })}
        </div>
        <button
          className="btn btn-light btn-block"
          type="button"
          onClick={async () => { const msg = await share(`${post.display_name} on PawTrack`, `/community/p/${post.id}`); if (msg) onToast(msg) }}
        >
          <Link2 size={16} /> Share outside PawTrack or copy link
        </button>
      </div>
    </Modal>,
    document.body,
  )
}
