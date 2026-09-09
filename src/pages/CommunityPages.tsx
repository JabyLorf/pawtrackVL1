import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, publicUrl } from '../lib/supabase'
import { ago, isListed } from '../lib/utils'
import { authorLabel, compactNum, dmThread, isOfficial, notify } from '../lib/community'
import type { ChatMessage, Dog, Follow, Notification, Post, PostComment, PostLike, Profile, Repost } from '../types'
import { useAuth } from '../context/AuthContext'
import { useCommunityUi } from '../context/CommunityUiContext'
import { AdoptBrowse } from '../components/AdoptBrowse'
import { Avatar } from '../components/Avatar'
import { CommunityPost, PostMedia } from '../components/CommunityPost'
import { DogPeek } from '../components/DogPeek'
import { DogPhoto } from '../components/DogCard'
import { IconAngle, IconExit, IconGear, IconLock, IconUser } from '../components/Icons'

type Bundle = {
  posts: Post[]
  people: Record<string, Profile>
  likes: PostLike[]
  comments: PostComment[]
  reposts: Repost[]
  follows: Follow[]
}

async function loadSocial(meId: string): Promise<Bundle> {
  const [{ data: posts }, { data: likes }, { data: comments }, { data: reposts }, { data: follows }] = await Promise.all([
    supabase.from('posts').select('*').eq('hidden', false).order('created_at', { ascending: false }),
    supabase.from('post_likes').select('*'),
    supabase.from('comments').select('*').eq('hidden', false).order('created_at', { ascending: true }),
    supabase.from('reposts').select('*'),
    supabase.from('follows').select('*'),
  ])
  const postList = (posts as Post[]) || []
  const followList = (follows as Follow[]) || []
  const commentList = (comments as PostComment[]) || []
  const likeList = (likes as PostLike[]) || []
  const ids = [...new Set<string>([
    meId,
    ...postList.map((p) => p.user_id),
    ...followList.flatMap((f) => [f.follower_id, f.following_id]),
    ...commentList.map((c) => c.user_id),
    ...likeList.map((l) => l.user_id),
  ])]
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('*').in('id', ids)
    : { data: [] as Profile[] }
  const people: Record<string, Profile> = {}
  ;((profiles as Profile[]) || []).forEach((p) => { people[p.id] = p })
  return {
    posts: postList,
    people,
    likes: likeList,
    comments: commentList,
    reposts: (reposts as Repost[]) || [],
    follows: followList,
  }
}

function useSocial() {
  const { profile } = useAuth()
  const { bump } = useCommunityUi()
  const [data, setData] = useState<Bundle | null>(null)

  function reload() {
    if (!profile) return
    loadSocial(profile.id).then(setData)
  }

  useEffect(() => { reload() }, [profile?.id, bump])
  return { data, reload, me: profile }
}

function visiblePosts(data: Bundle, meId: string, followingOnly = false) {
  const followingIds = new Set(data.follows.filter((f) => f.follower_id === meId).map((f) => f.following_id))
  return data.posts.filter((p) => {
    const author = data.people[p.user_id]
    if (author?.private_account && p.user_id !== meId && !followingIds.has(p.user_id)) return false
    if (followingOnly) return followingIds.has(p.user_id) || p.user_id === meId
    return true
  })
}

export function CommunityFeedPage() {
  const { data, reload, me } = useSocial()
  const navigate = useNavigate()
  const [peek, setPeek] = useState<string | null>(null)
  const [dogs, setDogs] = useState<Dog[]>([])

  useEffect(() => {
    supabase.from('dogs').select('*').order('intake_at', { ascending: false }).then(({ data: rows }) => {
      setDogs(((rows as Dog[]) || []).filter(isListed).slice(0, 6))
    })
  }, [])

  if (!data || !me) return <p className="empty" style={{ padding: 24 }}>Loading feed…</p>

  const followingIds = new Set(data.follows.filter((f) => f.follower_id === me.id).map((f) => f.following_id))
  const posts = visiblePosts(data, me.id)
  const seen: Record<string, boolean> = {}
  const stories = posts.map((p) => data.people[p.user_id]).filter((u) => {
    if (!u || seen[u.id]) return false
    seen[u.id] = true
    return true
  })

  return (
    <div className="ig-layout">
      <div className="ig-center">
        {stories.length ? (
          <div className="stories-wrap">
            <div className="stories">
              {stories.map((u) => (
                <button className="story" type="button" key={u.id} onClick={() => navigate(u.id === me.id ? '/community/profile' : `/community/u/${u.id}`)}>
                  <div className="story-ring"><Avatar user={u} /></div>
                  <span>{(isOfficial(u) ? 'oso' : u.username).slice(0, 10)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {dogs.length ? (
          <div className="adopt-strip">
            <div className="adopt-strip-head">
              <div>
                <b>Dogs looking for a home</b>
                <div className="muted">Adoption is free — tap a dog to read their story.</div>
              </div>
              <Link className="btn btn-accent btn-sm btn-pill" to="/community/adopt">View all</Link>
            </div>
            <div className="adopt-strip-row">
              {dogs.map((d) => (
                <button className="adopt-mini" type="button" key={d.id} onClick={() => setPeek(d.id)}>
                  <DogPhoto dog={d} className="adopt-mini-photo" />
                  <b>{d.name}</b>
                  <span>{d.sex} · {d.age}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {posts.length ? (
          <div className="ig-stream">
            {posts.map((p) => (
              <CommunityPost
                key={p.id}
                post={p}
                author={data.people[p.user_id]}
                people={data.people}
                likes={data.likes}
                comments={data.comments}
                reposts={data.reposts}
                followingIds={followingIds}
                onChange={reload}
              />
            ))}
          </div>
        ) : <p className="empty">No posts here yet. Tap + to share the first one.</p>}
      </div>
      {peek ? <DogPeek dogId={peek} onClose={() => setPeek(null)} /> : null}
    </div>
  )
}

export function CommunityExplorePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [people, setPeople] = useState<Profile[]>([])
  const [dogs, setDogs] = useState<Dog[]>([])

  useEffect(() => {
    supabase.from('profiles').select('*').eq('role', 'client').then(({ data }) => setPeople((data as Profile[]) || []))
    supabase.from('dogs').select('*').eq('visible', true).then(({ data: rows }) => setDogs((rows as Dog[]) || []))
  }, [])

  if (!profile) return <p className="empty" style={{ padding: 24 }}>Loading…</p>
  const n = q.trim().toLowerCase()
  const shown = people.filter((u) => {
    if (u.id === profile.id) return false
    if (!n) return true
    return `${u.username} ${u.display_name} ${u.bio}`.toLowerCase().includes(n)
  }).slice(0, 12)
  const dogRows = dogs.filter((d) => {
    if (!n) return !!d.owner_id || d.status === 'Available'
    return `${d.name} ${d.breed} ${d.status}`.toLowerCase().includes(n)
  }).slice(0, 12)

  return (
    <div className="ig-search">
      <h1 className="page-h1">Search</h1>
      <input type="search" placeholder="Search people or dogs" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length ? <p className="search-label">{n ? 'People' : 'Suggested people'}</p> : null}
      {shown.map((u) => (
        <button className="search-row" type="button" key={u.id} onClick={() => navigate(`/community/u/${u.id}`)}>
          <Avatar user={u} />
          <div><b>{u.username}</b><div className="muted">{u.display_name}{u.bio ? ` · ${u.bio}` : ''}</div></div>
        </button>
      ))}
      {dogRows.length ? <p className="search-label">Dogs</p> : null}
      {dogRows.map((d) => (
        <button className="search-row" type="button" key={d.id} onClick={() => navigate('/community/adopt')}>
          <DogPhoto dog={d} className="search-dog" />
          <div><b>{d.name}</b><div className="muted">{d.breed} · {d.status}{d.owner_id ? ' · owned' : ''}</div></div>
        </button>
      ))}
      {!shown.length && !dogRows.length ? <p className="empty">No matches.</p> : null}
    </div>
  )
}

export function CommunityAdoptPage() {
  return (
    <div className="client-adopt" style={{ padding: '0 16px' }}>
      <h1 className="page-h1">Adopt</h1>
      <p className="page-sub">Dogs looking for a home at Ormoc Strays Oasis.</p>
      <AdoptBrowse compact />
    </div>
  )
}

export function CommunityMessagesPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<'community' | 'direct'>('community')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [people, setPeople] = useState<Record<string, Profile>>({})
  const [follows, setFollows] = useState<Follow[]>([])
  const [dmId, setDmId] = useState<string | null>(null)
  const [text, setText] = useState('')

  function reload() {
    if (!profile) return
    supabase.from('chat_messages').select('*').order('created_at', { ascending: true }).then(({ data }) => setMessages((data as ChatMessage[]) || []))
    supabase.from('follows').select('*').eq('follower_id', profile.id).then(({ data }) => setFollows((data as Follow[]) || []))
    supabase.from('profiles').select('*').then(({ data }) => {
      const map: Record<string, Profile> = {}
      ;((data as Profile[]) || []).forEach((p) => { map[p.id] = p })
      setPeople(map)
    })
  }

  useEffect(() => { reload() }, [profile?.id])

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!profile || !text.trim()) return
    const thread = tab === 'community' ? 'community' : dmId === 'owners' ? 'owners' : dmThread(profile.id, dmId || '')
    await supabase.from('chat_messages').insert({ thread, from_id: profile.id, text: text.trim() })
    setText('')
    reload()
  }

  if (!profile) return null
  const followed = follows.map((f) => people[f.following_id]).filter(Boolean)
  const thread = tab === 'community' ? 'community' : dmId === 'owners' ? 'owners' : dmId ? dmThread(profile.id, dmId) : ''
  const rows = messages.filter((m) => m.thread === thread)

  return (
    <div className="msg-page">
      <div className="chat-head">
        <button className={'chat-tab' + (tab === 'community' ? ' on' : '')} type="button" onClick={() => { setTab('community'); setDmId(null) }}>Community</button>
        <button className={'chat-tab' + (tab === 'direct' ? ' on' : '')} type="button" onClick={() => setTab('direct')}>Direct</button>
      </div>
      {tab === 'direct' && !dmId ? (
        <>
          <p className="chat-note">Message people you follow. Community chat stays on the Community tab.</p>
          <div className="chat-log">
            <button className="dm-row" type="button" onClick={() => setDmId('owners')}>
              <div className="avatar" style={{ background: 'var(--brand)' }}>🐾</div>
              <div><b>Ormoc Strays Oasis</b><div className="muted">Shelter staff</div></div>
            </button>
            {followed.map((p) => (
              <button className="dm-row" type="button" key={p.id} onClick={() => setDmId(p.id)}>
                <Avatar user={p} />
                <div><b>{p.display_name}</b><div className="muted">@{p.username}</div></div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {tab === 'direct' && dmId ? (
            <div className="dm-head">
              <button className="link" type="button" onClick={() => setDmId(null)}>← Chats</button>
              <b>{dmId === 'owners' ? 'Ormoc Strays Oasis' : people[dmId]?.display_name}</b>
            </div>
          ) : <p className="chat-note">Chat with other community members.</p>}
          <div className="chat-log">
            {rows.length ? rows.map((m) => {
              const from = people[m.from_id]
              const mine = m.from_id === profile.id
              return (
                <div className={'chat-msg' + (mine ? ' mine' : '')} key={m.id}>
                  <Avatar user={from} />
                  <div>
                    <b>{authorLabel(from)}</b>
                    <p>{m.text}</p>
                    <span>{ago(m.created_at)}</span>
                  </div>
                </div>
              )
            }) : <p className="empty">No messages yet.</p>}
          </div>
          <form className="row chat-compose" onSubmit={send}>
            <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" />
            <button className="btn btn-coral" type="submit">Send</button>
          </form>
        </>
      )}
    </div>
  )
}

export function CommunityNotificationsPage() {
  const { profile } = useAuth()
  const { refreshUnread } = useCommunityUi()
  const navigate = useNavigate()
  const [notes, setNotes] = useState<Notification[]>([])
  const [people, setPeople] = useState<Record<string, Profile>>({})

  useEffect(() => {
    if (!profile) return
    supabase.from('notifications').select('*').eq('to_user_id', profile.id).order('created_at', { ascending: false }).then(async ({ data }) => {
      const list = (data as Notification[]) || []
      setNotes(list)
      const ids = [...new Set(list.map((n) => n.from_user_id).filter(Boolean))] as string[]
      if (ids.length) {
        const { data: rows } = await supabase.from('profiles').select('*').in('id', ids)
        const map: Record<string, Profile> = {}
        ;((rows as Profile[]) || []).forEach((p) => { map[p.id] = p })
        setPeople(map)
      }
      const unread = list.filter((n) => !n.read).map((n) => n.id)
      if (unread.length) {
        await supabase.from('notifications').update({ read: true }).in('id', unread)
        refreshUnread()
      }
    })
  }, [profile?.id])

  return (
    <div>
      <h1 className="page-h1" style={{ padding: '0 16px 8px' }}>Notifications</h1>
      {notes.length ? notes.map((n) => {
        const from = n.from_user_id ? people[n.from_user_id] : null
        return (
          <button
            className="note-row"
            type="button"
            key={n.id}
            onClick={() => {
              if (n.type === 'adopt') navigate('/community/profile')
              else if (n.from_user_id) navigate(`/community/u/${n.from_user_id}`)
            }}
          >
            <Avatar user={from} />
            <div>
              <p><b>{from?.username || 'PawTrack'}</b> {n.text}</p>
              <div className="when">{ago(n.created_at)}</div>
            </div>
          </button>
        )
      }) : <p className="empty" style={{ padding: 16 }}>No notifications yet.</p>}
    </div>
  )
}

function ProfileView({ user, isSelf, data, onChange }: { user: Profile; isSelf: boolean; data: Bundle; onChange: () => void }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'posts' | 'dogs'>('posts')
  const [dogs, setDogs] = useState<Dog[]>([])
  const [pending, setPending] = useState<Dog[]>([])
  const following = data.follows.some((f) => f.follower_id === profile?.id && f.following_id === user.id)
  const locked = !isSelf && user.private_account && !following
  const mine = data.posts.filter((p) => p.user_id === user.id)
  const followers = data.follows.filter((f) => f.following_id === user.id).length
  const followingN = data.follows.filter((f) => f.follower_id === user.id).length
  const likeN = data.likes.filter((l) => mine.some((p) => p.id === l.post_id)).length

  useEffect(() => {
    supabase.from('dogs').select('*').eq('owner_id', user.id).then(({ data: rows }) => setDogs((rows as Dog[]) || []))
    if (isSelf && profile) {
      supabase.from('adoptions').select('dog_id').eq('user_id', profile.id).eq('status', 'pending').then(async ({ data: rows }) => {
        const ids = ((rows as { dog_id: string }[]) || []).map((r) => r.dog_id)
        if (!ids.length) { setPending([]); return }
        const { data: wait } = await supabase.from('dogs').select('*').in('id', ids)
        setPending((wait as Dog[]) || [])
      })
    } else setPending([])
  }, [user.id, isSelf, profile?.id])

  async function toggleFollow() {
    if (!profile || isSelf) return
    if (following) await supabase.from('follows').delete().eq('follower_id', profile.id).eq('following_id', user.id)
    else {
      await supabase.from('follows').insert({ follower_id: profile.id, following_id: user.id })
      await notify(profile.id, user.id, 'started following you', { type: 'follow' })
    }
    onChange()
  }

  return (
    <div className="ig-profile">
      <div className="ig-profile-head">
        <Avatar user={user} size="xl" />
        <div>
          <div className="ig-profile-name">
            <h1>{user.username}</h1>
            {isSelf ? (
              <button className="btn btn-light" type="button" onClick={() => navigate('/community/settings')}>Edit profile</button>
            ) : (
              <button className={'btn ' + (following ? 'btn-ghost' : 'btn-coral')} type="button" onClick={toggleFollow}>
                {following ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
          <div className="ig-stats">
            <span><b>{mine.length}</b> posts</span>
            <span><b>{followers}</b> followers</span>
            <span><b>{followingN}</b> following</span>
            <span><b>{compactNum(likeN)}</b> likes</span>
            <span><b>{dogs.length}</b> dogs</span>
          </div>
          <p className="ig-bio"><b>{user.display_name}</b>{user.bio ? <><br />{user.bio}</> : null}</p>
        </div>
      </div>
      <div className="ig-tabs">
        <button className={tab === 'posts' ? 'on' : ''} type="button" onClick={() => setTab('posts')}>Posts</button>
        <button className={tab === 'dogs' ? 'on' : ''} type="button" onClick={() => setTab('dogs')}>Dogs</button>
      </div>
      <div className="profile-grid">
        {locked ? <p className="empty">This account is private. Follow to see their posts and dogs.</p> : tab === 'posts' ? (
          mine.length ? mine.map((p) => (
            <button className="post-card" type="button" key={p.id} onClick={() => navigate('/community')}>
              <PostMedia post={p} author={user} />
            </button>
          )) : <p className="empty">No posts yet.</p>
        ) : (
          <>
            {dogs.map((d) => (
              <div className="post-card dog-tile" key={d.id}>
                <DogPhoto dog={d} className="media" />
                <span className="dog-tile-name">{d.name}</span>
              </div>
            ))}
            {pending.map((d) => (
              <div className="post-card dog-tile" key={d.id}>
                <DogPhoto dog={d} className="media" />
                <span className="dog-tile-name">{d.name}</span>
                <span className="dog-tile-wait">Waiting</span>
              </div>
            ))}
            {!dogs.length && !pending.length ? <p className="empty">No dogs linked to this profile yet.</p> : null}
          </>
        )}
      </div>
      {isSelf ? (
        <div className="profile-adopt">
          <Link className="btn btn-accent btn-pill" to="/community/adopt">Browse dogs for adoption</Link>
        </div>
      ) : null}
    </div>
  )
}

export function CommunityProfilePage() {
  const { data, reload, me } = useSocial()
  if (!data || !me) return <p className="empty" style={{ padding: 24 }}>Loading profile…</p>
  return <ProfileView user={me} isSelf data={data} onChange={reload} />
}

export function CommunityUserPage() {
  const { id } = useParams()
  const { data, reload, me } = useSocial()
  const [user, setUser] = useState<Profile | null>(null)

  useEffect(() => {
    if (!id) return
    if (data?.people[id]) { setUser(data.people[id]); return }
    supabase.from('profiles').select('*').eq('id', id).maybeSingle().then(({ data: row }) => setUser((row as Profile) || null))
  }, [id, data])

  if (!data || !me) return <p className="empty" style={{ padding: 24 }}>Loading…</p>
  if (!user) return <p className="empty" style={{ padding: 24 }}>This account was not found.</p>
  if (user.id === me.id) return <ProfileView user={me} isSelf data={data} onChange={reload} />
  return <ProfileView user={user} isSelf={false} data={data} onChange={reload} />
}

function SettingsRow({
  to,
  action,
  icon,
  label,
  danger,
}: {
  to?: string
  action?: () => void
  icon: ReactNode
  label: string
  danger?: boolean
}) {
  const inner = (
    <>
      <span className="set-row-left">{icon}<span>{label}</span></span>
      {action && danger ? null : <span className="set-chevron"><IconAngle /></span>}
    </>
  )
  if (to) return <Link className={'set-row' + (danger ? ' danger' : '')} to={to}>{inner}</Link>
  return <button className={'set-row' + (danger ? ' danger' : '')} type="button" onClick={action}>{inner}</button>
}

export function CommunitySettingsPage() {
  const { signOut, isStaff } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="settings-page">
      <h1 className="page-h1" style={{ padding: '0 16px 12px' }}>Settings</h1>
      <div className="settings-menu">
        <SettingsRow to="/community/settings/edit" icon={<IconUser />} label="Edit profile" />
        <SettingsRow to="/community/settings/privacy" icon={<IconLock />} label="Privacy & Security" />
        {isStaff ? <SettingsRow to="/ops" icon={<IconGear />} label="Staff desk" /> : null}
        <SettingsRow to="/" icon={<IconPawLink />} label="Public website" />
        <SettingsRow action={() => signOut().then(() => navigate('/'))} icon={<IconExit />} label="Log out" danger />
      </div>
    </div>
  )
}

function IconPawLink() {
  return <span aria-hidden="true">🐾</span>
}

export function CommunityEditProfilePage() {
  const { profile, reloadProfile } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [username, setUsername] = useState(profile?.username || '')
  const [email, setEmail] = useState(profile?.email || '')
  const [bio, setBio] = useState(profile?.bio || '')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name)
    setUsername(profile.username)
    setEmail(profile.email || '')
    setBio(profile.bio)
  }, [profile])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setError('')
    let avatarUrl = profile.avatar_url
    if (file) {
      const path = `${profile.id}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file)
      if (upErr) { setError(upErr.message); return }
      avatarUrl = publicUrl('avatars', path)
    }
    const { error: err } = await supabase.from('profiles').update({
      display_name: displayName.trim() || username,
      username: username.trim(),
      email: email.trim(),
      bio,
      avatar_url: avatarUrl,
    }).eq('id', profile.id)
    if (err) { setError(err.message); return }
    await reloadProfile()
    setMsg('Profile saved.')
    setTimeout(() => navigate('/community/profile'), 700)
  }

  if (!profile) return null
  return (
    <div className="settings-page">
      <button className="link set-back" type="button" onClick={() => navigate('/community/settings')}>← Settings</button>
      <form className="settings-card" onSubmit={save}>
        <div className="settings-photo">
          <Avatar user={{ ...profile, avatar_url: preview || profile.avatar_url }} size="xl" />
          <label className="btn btn-light">
            Change photo
            <input type="file" accept="image/*" hidden onChange={(e) => {
              const next = e.target.files?.[0] || null
              setFile(next)
              setPreview(next ? URL.createObjectURL(next) : '')
            }} />
          </label>
        </div>
        <label>Display name</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>Bio</label>
        <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        {error ? <p className="err">{error}</p> : null}
        {msg ? <p className="ok">{msg}</p> : null}
        <button className="btn btn-coral btn-block" type="submit">Save changes</button>
      </form>
    </div>
  )
}

export function CommunityPrivacyPage() {
  const { profile, reloadProfile } = useAuth()
  const navigate = useNavigate()
  const [priv, setPriv] = useState(!!profile?.private_account)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { setPriv(!!profile?.private_account) }, [profile])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setError('')
    const { error: err } = await supabase.from('profiles').update({ private_account: priv }).eq('id', profile.id)
    if (err) { setError(err.message); return }
    if (current || next || confirm) {
      if (next.length < 6) { setError('New password must be at least 6 characters.'); return }
      if (next !== confirm) { setError('New passwords do not match.'); return }
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: profile.email || '', password: current })
      if (authErr) { setError('Current password is incorrect.'); return }
      const { error: passErr } = await supabase.auth.updateUser({ password: next })
      if (passErr) { setError(passErr.message); return }
    }
    await reloadProfile()
    setMsg('Privacy settings saved.')
  }

  return (
    <div className="settings-page">
      <button className="link set-back" type="button" onClick={() => navigate('/community/settings')}>← Settings</button>
      <form className="settings-card" onSubmit={save}>
        <h2 className="set-card-title">Account privacy</h2>
        <label className="set-check">
          <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
          <span><b>Private account</b><small>Only people who follow you can see your posts and dogs.</small></span>
        </label>
      </form>
      <form className="settings-card" onSubmit={save}>
        <h2 className="set-card-title">Password</h2>
        <label>Current password</label>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" />
        <label>New password</label>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 6 characters" />
        <label>Confirm new password</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat new password" />
        {error ? <p className="err">{error}</p> : null}
        {msg ? <p className="ok">{msg}</p> : null}
        <button className="btn btn-coral btn-block" type="submit">Save</button>
      </form>
    </div>
  )
}
