import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AtSign,
  BadgeCheck,
  Camera,
  Flag,
  MessageSquare,
  Heart,
  ImagePlus,
  Loader2,
  Lock,
  LogIn,
  Mail,
  MessageCircle,
  PawPrint,
  Pencil,
  Repeat2,
  Send,
  Share2,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ago, isListed, passwordOk } from '../lib/utils'
import type { CommunityProfile, Dog, Person, Post, PostComment } from '../types'
import { PublicLayout } from '../components/PublicLayout'
import { Modal } from '../components/Modal'
import { Avatar } from '../components/Avatar'
import { friendly, Name, share, Toast, useJoin } from '../components/CommunityUi'
import { ReportDialog, type ReportKind } from '../components/ReportDialog'
import { ShareSheet } from '../components/ShareSheet'
import { SquareCropper } from '../components/SquareCropper'
import { DogPeek } from '../components/DogPeek'
import { useConfirm } from '../components/ConfirmDialog'
import { useLeaveGuard } from '../components/useLeaveGuard'
import { useSignOut } from '../components/useSignOut'
import { AuthShell, CodeStep, Field, ForgotPassword, PasswordInput, PasswordRules } from './AuthPages'

// ---- helpers ----------------------------------------------------------------

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_PHOTO = 5 * 1024 * 1024

/** Checks a picked photo; returns an error message or null. */
function photoProblem(file: File) {
  if (!PHOTO_TYPES.includes(file.type)) return 'Please choose a JPG, PNG, WebP or GIF photo.'
  if (file.size > MAX_PHOTO) return 'That photo is larger than 5 MB. Please choose a smaller one.'
  return null
}

/** Uploads into the signed-in person's own folder; returns the public URL. */
async function uploadPhoto(userId: string, file: File) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('community').upload(path, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  return supabase.storage.from('community').getPublicUrl(path).data.publicUrl
}

/** Removes a photo the person uploaded (only works for their own files). */
async function removeOwnPhoto(url: string) {
  const marker = '/community/'
  const i = url.indexOf(marker)
  if (i < 0) return
  await supabase.storage.from('community').remove([decodeURIComponent(url.slice(i + marker.length))])
}

// ---- post card --------------------------------------------------------------

function PostCard({ post, onChange, full, onOpenDog, onFollowed }: {
  post: Post
  onChange: (next: Post | null) => void
  /** Called after following the author, so other posts by them update too. */
  onFollowed?: (authorId: string) => void
  /** On the post's own page: no "view comments" link, caption not shortened. */
  full?: boolean
  onOpenDog?: (dogId: string) => void
}) {
  const { profile, canPost, isStaff } = useAuth()
  const join = useJoin()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()
  const [toast, setToast] = useState('')
  const [expanded, setExpanded] = useState(!!full)
  const [reporting, setReporting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [following, setFollowing] = useState(false)
  const liking = useRef(false)

  function toggleRepost() {
    if (!canPost) { join(); return }
    confirm(post.reposted ? {
      title: 'Undo repost?',
      body: 'It will be removed from your followers\' timelines.',
      confirmLabel: 'Undo repost',
      action: async () => {
        const { error } = await supabase.from('reposts').delete().eq('post_id', post.id).eq('user_id', profile!.id)
        if (error) return friendly(error.message)
        onChange({ ...post, reposted: false, reposts: Math.max(0, post.reposts - 1) })
        return null
      },
    } : {
      title: 'Repost this?',
      body: `${post.display_name}'s post will show again on the Community timeline, with "${profile!.display_name} reposted" above it.`,
      confirmLabel: 'Repost',
      action: async () => {
        const { error } = await supabase.from('reposts').insert({ post_id: post.id })
        if (error && !/duplicate/i.test(error.message)) return friendly(error.message)
        onChange({ ...post, reposted: true, reposts: post.reposts + (error ? 0 : 1) })
        setToast('Reposted')
        return null
      },
    })
  }

  async function followAuthor() {
    if (!canPost) { join(); return }
    if (following) return
    setFollowing(true)
    const { error } = await supabase.from('follows').insert({ following_id: post.author_id })
    setFollowing(false)
    if (error && !/duplicate/i.test(error.message)) { setToast(friendly(error.message)); return }
    if (onFollowed) onFollowed(post.author_id)
    else onChange({ ...post, following_author: true })
  }

  async function toggleLike() {
    if (!canPost) { join(); return }
    if (liking.current) return
    liking.current = true
    const next = { ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) }
    onChange(next)
    const { error } = post.liked
      ? await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', profile!.id)
      : await supabase.from('post_likes').insert({ post_id: post.id })
    if (error && !/duplicate/i.test(error.message)) onChange(post)
    liking.current = false
  }

  const mine = profile?.id === post.author_id
  const canDelete = mine || isStaff
  const long = post.body.length > 180 || post.body.split('\n').length > 3

  return (
    <article className="post">
      {post.reposted_by_id ? (
        <p className="repost-label">
          <Repeat2 size={14} />
          <Link to={`/community/u/${post.reposted_by_username}`}>{post.reposted_by_id === profile?.id ? 'You' : post.reposted_by_name}</Link> reposted
        </p>
      ) : null}
      <header className="post-head">
        <Link to={`/community/u/${post.username}`}><Avatar src={post.avatar_url} name={post.display_name} /></Link>
        <div className="post-who">
          <span className="who-line">
            <Name p={post} />
            {!mine && !post.following_author ? (
              <>
                <span className="dot" aria-hidden="true">·</span>
                <button className="follow-link" type="button" onClick={followAuthor} disabled={following}>{following ? 'Following…' : 'Follow'}</button>
              </>
            ) : null}
          </span>
          <small className="post-sub"><Link to={`/community/u/${post.username}`}>@{post.username}</Link> · <Link to={`/community/p/${post.id}`}>{ago(post.created_at)}</Link></small>
        </div>
        {canPost && !mine ? (
          <button className="icon-btn" type="button" aria-label="Report post" title="Report" onClick={() => setReporting(true)}><Flag size={16} /></button>
        ) : null}
        {canDelete ? (
          <button className="icon-btn" type="button" aria-label="Delete post" onClick={() => confirm({
            title: 'Delete this post?',
            body: mine ? 'Your post, its likes and comments will be removed for good.' : `This removes ${post.display_name}'s post, its likes and comments for good.`,
            confirmLabel: 'Delete post',
            busyLabel: 'Deleting…',
            danger: true,
            action: async () => {
              const { error } = await supabase.from('posts').delete().eq('id', post.id)
              if (error) return friendly(error.message)
              if (mine && post.photo_url) await removeOwnPhoto(post.photo_url)
              onChange(null)
              if (full) navigate('/community', { replace: true })
              return null
            },
          })}><Trash2 size={17} /></button>
        ) : null}
      </header>
      {post.photo_url ? (
        <div className="post-photo" onDoubleClick={() => { if (!post.liked) toggleLike() }}>
          <img src={post.photo_url} alt={post.body ? post.body.slice(0, 120) : `Photo shared by ${post.display_name}`} loading="lazy" />
        </div>
      ) : null}
      <div className="post-actions">
        <button className={'post-act' + (post.liked ? ' liked' : '')} type="button" onClick={toggleLike} aria-pressed={post.liked} aria-label={post.liked ? 'Unlike' : 'Like'}>
          <Heart size={22} fill={post.liked ? 'currentColor' : 'none'} />
        </button>
        <Link className="post-act" to={`/community/p/${post.id}#comment`} aria-label="Comment"><MessageCircle size={22} /></Link>
        {!mine ? (
          <button className={'post-act' + (post.reposted ? ' reposted' : '')} type="button" onClick={toggleRepost} aria-pressed={post.reposted} aria-label={post.reposted ? 'Undo repost' : 'Repost'} title={post.reposted ? 'Undo repost' : 'Repost'}>
            <Repeat2 size={23} />
          </button>
        ) : null}
        <button className="post-act" type="button" aria-label="Share" onClick={async () => {
          if (canPost) setSharing(true)
          else setToast(await share(`${post.display_name} on PawTrack`, `/community/p/${post.id}`))
        }}>
          <Share2 size={21} />
        </button>
        {post.dog_id && post.dog_name ? (
          <button className="btn btn-light btn-sm post-dog" type="button" onClick={() => onOpenDog?.(post.dog_id!)}>
            <PawPrint size={14} /> Meet {post.dog_name}
          </button>
        ) : null}
      </div>
      <div className="post-body">
        {post.likes || post.reposts ? (
          <p className="post-likes">
            {post.likes ? `${post.likes} ${post.likes === 1 ? 'like' : 'likes'}` : ''}
            {post.likes && post.reposts ? ' · ' : ''}
            {post.reposts ? `${post.reposts} ${post.reposts === 1 ? 'repost' : 'reposts'}` : ''}
          </p>
        ) : null}
        {post.body ? (
          <p className={'post-text' + (!expanded && long ? ' clamp' : '')}>
            <Link className="name-inline" to={`/community/u/${post.username}`}>{post.username}</Link> {post.body}
          </p>
        ) : null}
        {!expanded && long ? <button className="link more" type="button" onClick={() => setExpanded(true)}>more</button> : null}
        {!full && post.comments ? (
          <Link className="post-comments-link" to={`/community/p/${post.id}`}>
            View {post.comments === 1 ? '1 comment' : `all ${post.comments} comments`}
          </Link>
        ) : null}
      </div>
      {dialog}
      {reporting ? <ReportDialog kind="post" id={post.id} onClose={() => setReporting(false)} /> : null}
      {sharing ? <ShareSheet post={post} onClose={() => setSharing(false)} onToast={setToast} /> : null}
      <Toast text={toast} onDone={() => setToast('')} />
    </article>
  )
}

function JoinCard({ text }: { text: string }) {
  const navigate = useNavigate()
  return (
    <div className="join-card">
      <div>
        <b>Join the PawTrack community</b>
        <p>{text}</p>
      </div>
      <div className="join-actions">
        <button className="btn btn-primary" type="button" onClick={() => navigate('/join?mode=signup&next=/community')}><UserPlus size={16} /> Create account</button>
        <button className="btn btn-light" type="button" onClick={() => navigate('/join?next=/community')}><LogIn size={16} /> Sign in</button>
      </div>
    </div>
  )
}

// ---- feed -------------------------------------------------------------------

export function CommunityPage() {
  const { profile, canPost, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const scope = params.get('tab') === 'following' && canPost ? 'following' : 'all'
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [dog, setDog] = useState<string | null>(null)
  const PAGE = 15

  const load = useCallback(async (before?: string) => {
    setLoading(true)
    const { data } = await supabase.rpc('community_posts', { p_scope: scope, p_before: before || null, p_limit: PAGE })
    const rows = (data as Post[]) || []
    setPosts((prev) => (before ? [...prev, ...rows] : rows))
    setMore(rows.length === PAGE)
    setLoading(false)
  }, [scope])

  useEffect(() => { if (!authLoading) load() }, [load, authLoading])

  // The same post can be on the timeline more than once (original + reposts):
  // keep likes, comments and reposts in step across every copy.
  const update = (id: string) => (next: Post | null) =>
    setPosts((prev) => {
      if (!next) return prev.filter((p) => p.id !== id)
      const shared = { likes: next.likes, liked: next.liked, comments: next.comments, reposts: next.reposts, reposted: next.reposted, following_author: next.following_author }
      let list = prev.map((p) => (p.id === id ? { ...p, ...shared } : p))
      // Undoing my repost removes my "You reposted" copy.
      if (!next.reposted) list = list.filter((p) => !(p.id === id && p.reposted_by_id === profile?.id))
      return list
    })

  return (
    <PublicLayout noFooter>
      <section className="block community">
        <div className="feed-wrap">
          <div className="feed-top">
            <div>
              <p className="kicker">Community</p>
              <h2>PawTrack Community</h2>
            </div>
            {canPost ? (
              <button className="btn btn-primary" type="button" onClick={() => navigate('/community/new')}><ImagePlus size={17} /> New post</button>
            ) : null}
          </div>
          {canPost ? (
            <div className="feed-tabs" role="tablist">
              <button role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'on' : ''} type="button" onClick={() => setParams({})}>For you</button>
              <button role="tab" aria-selected={scope === 'following'} className={scope === 'following' ? 'on' : ''} type="button" onClick={() => setParams({ tab: 'following' })}>Following</button>
              <Link className="feed-me" to={`/community/u/${profile!.username}`}><Avatar src={profile!.avatar_url} name={profile!.display_name} size={28} /> My profile</Link>
            </div>
          ) : profile && profile.status === 'pending' ? (
            <p className="hint">Your staff application is still waiting for approval, so you can read the community but not post yet.</p>
          ) : (
            <JoinCard text="Share photos of your rescue, follow the shelter and other dog lovers, and cheer on dogs looking for a home." />
          )}

          {posts.map((p) => (
            <PostCard
              key={`${p.id}-${p.reposted_by_id || 'post'}`}
              post={p}
              onChange={update(p.id)}
              onOpenDog={setDog}
              onFollowed={(author) => setPosts((list) => list.map((x) => (x.author_id === author ? { ...x, following_author: true } : x)))}
            />
          ))}

          {loading ? <p className="empty"><Loader2 size={18} className="spin" /> Loading posts…</p> : null}
          {!loading && posts.length === 0 ? (
            <div className="empty panel feed-empty">
              <PawPrint size={28} />
              <p>{scope === 'following' ? "Posts from people you follow will show here. Follow someone from their profile." : 'No posts yet. Be the first to share!'}</p>
            </div>
          ) : null}
          {!loading && more ? (
            <button className="btn btn-light btn-block" type="button" onClick={() => load(posts[posts.length - 1]?.item_at)}>Load more</button>
          ) : null}
        </div>
      </section>
      {dog ? <DogPeek dogId={dog} onClose={() => setDog(null)} /> : null}
    </PublicLayout>
  )
}

// ---- single post + comments -------------------------------------------------

export function PostPage() {
  const { id } = useParams()
  const { profile, canPost, isStaff } = useAuth()
  const join = useJoin()
  const { confirm, dialog } = useConfirm()
  const [post, setPost] = useState<Post | null>(null)
  const [missing, setMissing] = useState(false)
  const [comments, setComments] = useState<PostComment[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [dog, setDog] = useState<string | null>(null)
  const [report, setReport] = useState<{ kind: ReportKind; id: string } | null>(null)
  const [replyTo, setReplyTo] = useState<{ id: string; username: string; name: string } | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)

  function startReply(c: PostComment) {
    if (!canPost) { join(); return }
    // Replies to a reply join the same thread, like Instagram.
    setReplyTo({ id: c.parent_id || c.id, username: c.username, name: c.display_name })
    setText((t) => (t.startsWith(`@${c.display_name} `) ? t : `@${c.display_name} `))
    setTimeout(() => box.current?.focus(), 0)
  }

  const loadComments = useCallback(async () => {
    const { data } = await supabase.rpc('community_comments', { p_post: id })
    setComments((data as PostComment[]) || [])
  }, [id])

  useEffect(() => {
    supabase.rpc('community_posts', { p_scope: 'all', p_id: id, p_limit: 1 }).then(({ data }) => {
      const row = ((data as Post[]) || [])[0]
      if (row) setPost(row)
      else setMissing(true)
    })
    loadComments()
  }, [id, loadComments])

  useEffect(() => {
    if (post && window.location.hash === '#comment' && canPost) box.current?.focus()
  }, [post, canPost])

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!canPost) { join(); return }
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    const { error: err } = await supabase.from('post_comments').insert({ post_id: id, body, parent_id: replyTo?.id || null })
    setSending(false)
    if (err) { setError(friendly(err.message)); return }
    setText('')
    setReplyTo(null)
    await loadComments()
    setPost((p) => (p ? { ...p, comments: p.comments + 1 } : p))
  }

  return (
    <PublicLayout noFooter>
      <section className="block community">
        <div className="feed-wrap">
          <Link className="link back-link" to="/community">← Community</Link>
          {missing ? (
            <div className="empty panel feed-empty"><p>This post was deleted or doesn't exist.</p></div>
          ) : !post ? (
            <p className="empty"><Loader2 size={18} className="spin" /> Loading…</p>
          ) : (
            <>
              <PostCard post={post} full onChange={(next) => (next ? setPost(next) : setMissing(true))} onOpenDog={setDog} />
              <div className="comments panel">
                <h3>Comments</h3>
                {comments.length === 0 ? <p className="muted">No comments yet.</p> : null}
                {comments.filter((c) => !c.parent_id).map((c) => {
                  const replies = comments.filter((r) => r.parent_id === c.id)
                  const row = (x: PostComment, reply: boolean) => {
                    // A reply that starts with "@Name" (or an older "@username") shows the name as a link.
                    const tagged = reply ? comments.find((y) => x.body.startsWith(`@${y.display_name} `) || x.body.startsWith(`@${y.username} `)) : undefined
                    const tag = tagged ? (x.body.startsWith(`@${tagged.display_name} `) ? `@${tagged.display_name} ` : `@${tagged.username} `) : ''
                    const canDelete = profile?.id === x.author_id || profile?.id === post.author_id || isStaff
                    return (
                      <div className={'comment' + (reply ? ' reply' : '')} key={x.id}>
                        <Link to={`/community/u/${x.username}`}><Avatar src={x.avatar_url} name={x.display_name} size={reply ? 26 : 30} /></Link>
                        <div className="comment-main">
                          <p><Name p={x} /> <span className="comment-text">{tagged ? <><Link className="mention" to={`/community/u/${tagged.username}`}>@{tagged.display_name}</Link> {x.body.slice(tag.length)}</> : x.body}</span></p>
                          <div className="comment-meta">
                            <small className="muted">{ago(x.created_at)}</small>
                            <button className="link comment-reply" type="button" onClick={() => startReply(x)}>Reply</button>
                          </div>
                        </div>
                        {canPost && profile?.id !== x.author_id ? (
                          <button className="icon-btn sm" type="button" aria-label="Report comment" title="Report" onClick={() => setReport({ kind: 'comment', id: x.id })}><Flag size={14} /></button>
                        ) : null}
                        {canDelete ? (
                          <button className="icon-btn sm" type="button" aria-label="Delete comment" onClick={() => confirm({
                            title: reply ? 'Delete this reply?' : 'Delete this comment?',
                            body: !reply && replies.length
                              ? `The comment and its ${replies.length === 1 ? 'reply' : `${replies.length} replies`} will be removed for good.`
                              : 'It will be removed for good.',
                            confirmLabel: 'Delete',
                            danger: true,
                            action: async () => {
                              const { error: err } = await supabase.from('post_comments').delete().eq('id', x.id)
                              if (err) return friendly(err.message)
                              const gone = reply ? 1 : 1 + replies.length
                              setComments((list) => list.filter((y) => y.id !== x.id && y.parent_id !== x.id))
                              setPost((p) => (p ? { ...p, comments: Math.max(0, p.comments - gone) } : p))
                              if (replyTo?.id === x.id) setReplyTo(null)
                              return null
                            },
                          })}><Trash2 size={15} /></button>
                        ) : null}
                      </div>
                    )
                  }
                  return (
                    <div className="thread" key={c.id}>
                      {row(c, false)}
                      {replies.length ? <div className="replies">{replies.map((r) => row(r, true))}</div> : null}
                    </div>
                  )
                })}
                {canPost && replyTo ? (
                  <div className="replying">
                    Replying to <b>{replyTo.name}</b>
                    <button className="icon-btn sm" type="button" aria-label="Cancel reply" onClick={() => { setReplyTo(null); setText('') }}><X size={14} /></button>
                  </div>
                ) : null}
                {canPost ? (
                  <form className="comment-form" onSubmit={send}>
                    <Avatar src={profile!.avatar_url} name={profile!.display_name} size={30} />
                    <textarea
                      ref={box}
                      rows={1}
                      maxLength={500}
                      placeholder={replyTo ? `Reply to ${replyTo.name}…` : 'Add a comment…'}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit() } }}
                    />
                    <button className="icon-btn brand" type="submit" disabled={!text.trim() || sending} aria-label="Post comment">
                      {sending ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
                    </button>
                  </form>
                ) : (
                  <button className="btn btn-light btn-block" type="button" onClick={join}><LogIn size={16} /> Sign in to comment</button>
                )}
                {error ? <p className="err">{error}</p> : null}
              </div>
            </>
          )}
        </div>
      </section>
      {dog ? <DogPeek dogId={dog} onClose={() => setDog(null)} /> : null}
      {report ? <ReportDialog kind={report.kind} id={report.id} onClose={() => setReport(null)} /> : null}
      {dialog}
    </PublicLayout>
  )
}

// ---- new post ---------------------------------------------------------------

export function NewPostPage() {
  const { profile, canPost, isStaff, loading } = useAuth()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [body, setBody] = useState('')
  const [dogId, setDogId] = useState('')
  const [dogs, setDogs] = useState<Dog[]>([])
  const [error, setError] = useState('')
  const dirty = !!file || !!body.trim()
  const { leaveDialog, allowLeave } = useLeaveGuard(dirty, { what: 'this post' })

  useEffect(() => {
    if (!loading && !canPost) navigate('/join?next=/community/new', { replace: true })
  }, [loading, canPost, navigate])

  useEffect(() => {
    if (!isStaff) return
    supabase.from('dogs').select('*').order('name').then(({ data }) => setDogs(((data as Dog[]) || []).filter(isListed)))
  }, [isStaff])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function pick(f: File | null) {
    setError('')
    if (!f) return
    const problem = photoProblem(f)
    if (problem) { setError(problem); return }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function review(e: FormEvent) {
    e.preventDefault()
    if (!file && !body.trim()) { setError('Add a photo or write something to share.'); return }
    confirm({
      title: 'Share this post?',
      body: 'Everyone visiting the PawTrack Community will be able to see it.',
      confirmLabel: 'Share',
      busyLabel: file ? 'Uploading…' : 'Sharing…',
      action: async () => {
        try {
          const photo_url = file ? await uploadPhoto(profile!.id, file) : ''
          const { data, error: err } = await supabase
            .from('posts')
            .insert({ body: body.trim(), photo_url, dog_id: dogId || null })
            .select('id')
            .single()
          if (err) {
            if (photo_url) await removeOwnPhoto(photo_url)
            return friendly(err.message)
          }
          allowLeave()
          navigate(`/community/p/${data.id}`, { replace: true })
          return null
        } catch (x) {
          return x instanceof Error ? x.message : 'Upload failed. Please try again.'
        }
      },
    })
  }

  return (
    <PublicLayout noFooter>
      <section className="block community">
        <div className="feed-wrap">
          <Link className="link back-link" to="/community">← Community</Link>
          <form className="panel composer" onSubmit={review}>
            <h2>New post</h2>
            <label className={'photo-drop' + (preview ? ' has' : '')}>
              {preview ? <img src={preview} alt="Selected photo" /> : (
                <span><ImagePlus size={30} /><b>Add a photo</b><small>JPG, PNG, WebP or GIF, up to 5 MB</small></span>
              )}
              <input type="file" accept={PHOTO_TYPES.join(',')} onChange={(e) => pick(e.target.files?.[0] || null)} />
            </label>
            {preview ? <button className="link" type="button" onClick={() => { setFile(null); setPreview('') }}>Remove photo</button> : null}
            <label htmlFor="post-body">Caption</label>
            <textarea id="post-body" rows={4} maxLength={2200} placeholder="Write a caption…" value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="hint">{body.length} / 2200</p>
            {isStaff && dogs.length ? (
              <>
                <label htmlFor="post-dog">Feature a dog up for adoption (optional)</label>
                <select id="post-dog" value={dogId} onChange={(e) => setDogId(e.target.value)}>
                  <option value="">None</option>
                  {dogs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </>
            ) : null}
            {error ? <p className="err">{error}</p> : null}
            <button className="btn btn-primary btn-block" type="submit">Share</button>
          </form>
        </div>
      </section>
      {dialog}
      {leaveDialog}
    </PublicLayout>
  )
}

// ---- profile ----------------------------------------------------------------

function PeopleList({ user, kind, onClose }: { user: CommunityProfile; kind: 'followers' | 'following'; onClose: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null)
  useEffect(() => {
    supabase.rpc('community_people', { p_user: user.id, p_kind: kind }).then(({ data }) => setPeople((data as Person[]) || []))
  }, [user.id, kind])
  return (
    <Modal onClose={onClose}>
      <div className="dialog people">
        <div className="people-head">
          <h2>{kind === 'followers' ? 'Followers' : 'Following'}</h2>
          <button className="icon-btn" type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {!people ? <p className="muted">Loading…</p> : people.length === 0 ? (
          <p className="muted">{kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</p>
        ) : people.map((p) => (
          <Link key={p.id} className="who-row" to={`/community/u/${p.username}`} onClick={onClose}>
            <Avatar src={p.avatar_url} name={p.display_name} size={38} />
            <span><Name p={p} link={false} /><small>@{p.username}</small></span>
          </Link>
        ))}
      </div>
    </Modal>
  )
}

function EditProfile({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { profile, reloadProfile } = useAuth()
  const { confirm, dialog } = useConfirm()
  const [name, setName] = useState(profile?.display_name || '')
  const [bio, setBio] = useState(profile?.bio || '')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState(profile?.avatar_url || '')
  const [error, setError] = useState('')
  // A picked photo waits here until it's cropped to a square.
  const [cropping, setCropping] = useState<File | null>(null)

  function pick(f: File | null) {
    setError('')
    if (!f) return
    const problem = photoProblem(f)
    if (problem) { setError(problem); return }
    setCropping(f)
  }

  function review(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Enter your name.'); return }
    confirm({
      title: 'Save your profile?',
      body: 'Your name, photo and bio are shown to everyone on the Community.',
      confirmLabel: 'Save',
      busyLabel: 'Saving…',
      action: async () => {
        try {
          const old = profile?.avatar_url || ''
          const avatar_url = file ? await uploadPhoto(profile!.id, file) : old
          const { error: err } = await supabase.from('profiles')
            .update({ display_name: name.trim().slice(0, 60), bio: bio.trim().slice(0, 300), avatar_url })
            .eq('id', profile!.id)
          if (err) return friendly(err.message)
          if (file && old) await removeOwnPhoto(old)
          await reloadProfile()
          onSaved()
          return null
        } catch (x) {
          return x instanceof Error ? x.message : 'Upload failed. Please try again.'
        }
      },
    })
  }

  return (
    <>
    <Modal onClose={() => { if (cropping) setCropping(null); else onClose() }}>
      {cropping ? (
        <div className="dialog">
          <SquareCropper
            file={cropping}
            onCancel={() => setCropping(null)}
            onDone={(cropped) => { setFile(cropped); setPreview(URL.createObjectURL(cropped)); setCropping(null) }}
          />
        </div>
      ) : (
      <form className="dialog edit-profile" onSubmit={review}>
        <div className="people-head">
          <h2>Edit profile</h2>
          <button className="icon-btn" type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="avatar-pick">
          <Avatar src={preview} name={name || '?'} size={84} />
          <span><Camera size={15} /> Change photo</span>
          <input type="file" accept={PHOTO_TYPES.join(',')} onChange={(e) => { pick(e.target.files?.[0] || null); e.target.value = '' }} />
        </label>
        <label htmlFor="ep-name">Name</label>
        <input id="ep-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="ep-bio">Bio</label>
        <textarea id="ep-bio" rows={3} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell people about you and your dogs" />
        <p className="hint">{bio.length} / 300</p>
        {error ? <p className="err">{error}</p> : null}
        <div className="dialog-actions">
          <button className="btn btn-light" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="submit">Save</button>
        </div>
      </form>
      )}
    </Modal>
    {dialog}
    </>
  )
}

export function ProfilePage() {
  const { username = '' } = useParams()
  const { profile, canPost, isStaff } = useAuth()
  const join = useJoin()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()
  const { askSignOut, signOutDialog } = useSignOut()
  const [user, setUser] = useState<CommunityProfile | null>(null)
  const [missing, setMissing] = useState(false)
  const [posts, setPosts] = useState<Post[]>([])
  const [list, setList] = useState<'followers' | 'following' | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [reporting, setReporting] = useState(false)

  async function message() {
    if (!canPost) { join(); return }
    if (!user) return
    const { data, error } = await supabase.rpc('start_dm', { p_user: user.id })
    if (error) { setToast(error.message); return }
    navigate(`/messages/${data}`)
  }

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('community_profile', { p_username: username })
    const row = ((data as CommunityProfile[]) || [])[0]
    if (!row) { setMissing(true); return }
    setMissing(false)
    setUser(row)
    const { data: p } = await supabase.rpc('community_posts', { p_scope: 'user', p_author: row.id, p_limit: 50 })
    setPosts((p as Post[]) || [])
  }, [username])

  useEffect(() => { load() }, [load])

  const me = !!profile && user?.id === profile.id

  async function follow() {
    if (!canPost) { join(); return }
    if (!user || busy) return
    setBusy(true)
    const { error } = await supabase.from('follows').insert({ following_id: user.id })
    setBusy(false)
    if (!error || /duplicate/i.test(error.message)) setUser({ ...user, followed_by_me: true, followers: user.followers + (error ? 0 : 1) })
  }

  function unfollow() {
    if (!user) return
    confirm({
      title: `Unfollow ${user.display_name}?`,
      body: 'Their posts will no longer show in your Following tab.',
      confirmLabel: 'Unfollow',
      action: async () => {
        const { error } = await supabase.from('follows').delete().eq('follower_id', profile!.id).eq('following_id', user.id)
        if (error) return friendly(error.message)
        setUser({ ...user, followed_by_me: false, followers: Math.max(0, user.followers - 1) })
        return null
      },
    })
  }

  return (
    <PublicLayout noFooter>
      <section className="block community">
        <div className="feed-wrap wide">
          {missing ? (
            <div className="empty panel feed-empty"><p>This profile doesn't exist.</p><Link className="btn btn-light" to="/community">Back to Community</Link></div>
          ) : !user ? (
            <p className="empty"><Loader2 size={18} className="spin" /> Loading…</p>
          ) : (
            <>
              <div className="profile-head">
                <Avatar src={user.avatar_url} name={user.display_name} size={96} />
                <div className="profile-info">
                  <div className="profile-title">
                    <h1>{user.display_name}</h1>
                    {user.is_shelter ? <span className="shelter-tag"><BadgeCheck size={14} /> Ormoc Strays Oasis</span> : null}
                  </div>
                  <p className="muted">@{user.username}</p>
                  <div className="profile-stats">
                    <span><b>{user.posts}</b> {user.posts === 1 ? 'post' : 'posts'}</span>
                    <button type="button" onClick={() => setList('followers')}><b>{user.followers}</b> {user.followers === 1 ? 'follower' : 'followers'}</button>
                    <button type="button" onClick={() => setList('following')}><b>{user.following}</b> following</button>
                  </div>
                  {user.bio ? <p className="profile-bio">{user.bio}</p> : null}
                  <div className="profile-actions">
                    {me ? (
                      <>
                        <button className="btn btn-light btn-sm" type="button" onClick={() => setEditing(true)}><Pencil size={15} /> Edit profile</button>
                        <button className="btn btn-primary btn-sm" type="button" onClick={() => navigate('/community/new')}><ImagePlus size={15} /> New post</button>
                        {isStaff ? <Link className="btn btn-light btn-sm" to="/ops">Staff desk</Link> : null}
                        <button className="btn btn-light btn-sm hide-phone" type="button" onClick={askSignOut}>Sign out</button>
                      </>
                    ) : (
                      <>
                        {user.followed_by_me ? (
                          <button className="btn btn-light btn-sm" type="button" onClick={unfollow}><UserCheck size={15} /> Following</button>
                        ) : (
                          <button className="btn btn-primary btn-sm" type="button" onClick={follow} disabled={busy}><UserPlus size={15} /> Follow</button>
                        )}
                        <button className="btn btn-light btn-sm" type="button" onClick={message}><MessageSquare size={15} /> Message</button>
                      </>
                    )}
                    <button className="btn btn-light btn-sm" type="button" onClick={async () => setToast(await share(`${user.display_name} on PawTrack`, `/community/u/${user.username}`))}>
                      <Share2 size={15} /> Share
                    </button>
                    {canPost && !me ? (
                      <button className="btn btn-light btn-sm" type="button" onClick={() => setReporting(true)}><Flag size={15} /> Report</button>
                    ) : null}
                  </div>
                </div>
              </div>
              {posts.length === 0 ? (
                <div className="empty panel feed-empty">
                  <Users size={26} />
                  <p>{me ? "You haven't posted yet." : 'No posts yet.'}</p>
                  {me ? <button className="btn btn-primary" type="button" onClick={() => navigate('/community/new')}><ImagePlus size={16} /> Share your first post</button> : null}
                </div>
              ) : (
                <div className="post-grid">
                  {posts.map((p) => (
                    <Link key={p.id} className="post-tile" to={`/community/p/${p.id}`} aria-label={`Post from ${ago(p.created_at)}`}>
                      {p.photo_url ? <img src={p.photo_url} alt="" loading="lazy" /> : <span className="tile-text">{p.body}</span>}
                      <span className="tile-stats"><Heart size={14} fill="currentColor" /> {p.likes} <MessageCircle size={14} fill="currentColor" /> {p.comments}</span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>
      {list && user ? <PeopleList user={user} kind={list} onClose={() => setList(null)} /> : null}
      {editing ? <EditProfile onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} /> : null}
      {dialog}
      {signOutDialog}
      {reporting && user ? <ReportDialog kind="user" id={user.id} onClose={() => setReporting(false)} /> : null}
      <Toast text={toast} onDone={() => setToast('')} />
    </PublicLayout>
  )
}

// ---- join / sign in ---------------------------------------------------------

const COMMUNITY_SIDE: ReactNode = (
  <>
    <h2>PawTrack Community</h2>
    <p>The social side of Ormoc Strays Oasis: rescue stories, happy adoptions and dog lovers from Ormoc and beyond.</p>
    <ul className="auth-points">
      <li><ImagePlus size={18} /> Share photos of your dogs</li>
      <li><Heart size={18} /> Like and comment on posts</li>
      <li><UserPlus size={18} /> Follow the shelter and other members</li>
    </ul>
  </>
)

export function JoinPage() {
  const { signIn, signUp, reloadProfile, profile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = (() => {
    const n = params.get('next') || '/community'
    return n.startsWith('/') && !n.startsWith('//') ? n : '/community'
  })()
  const [mode, setMode] = useState<'signin' | 'signup' | 'verify' | 'forgot'>(params.get('mode') === 'signup' ? 'signup' : 'signin')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  // Already signed in with an active account: nothing to do here.
  useEffect(() => {
    if (profile?.status === 'active' && mode !== 'verify') navigate(next, { replace: true })
  }, [profile, mode, next, navigate])

  async function signin(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const err = await signIn(email.trim(), password)
    setBusy(false)
    if (err) {
      if (/not confirmed/i.test(err)) { setMode('verify'); return }
      setError(err === 'Invalid login credentials' ? 'Wrong email or password.' : err)
      return
    }
    navigate(next, { replace: true })
  }

  async function signup(e: FormEvent) {
    e.preventDefault()
    setError('')
    const user = username.trim()
    if (!name.trim()) { setError('Enter your name.'); return }
    if (!/^[A-Za-z0-9._]{3,30}$/.test(user)) { setError('Username must be 3–30 letters, numbers, dots or underscores.'); return }
    if (!passwordOk(password)) { setError('Your password does not meet all the requirements.'); return }
    if (password !== confirmPw) { setError('Passwords do not match.'); return }
    setBusy(true)
    const { data: free, error: rpcErr } = await supabase.rpc('username_available', { p_username: user })
    if (rpcErr) { setBusy(false); setError(rpcErr.message); return }
    if (!free) { setBusy(false); setError('That username is already taken.'); return }
    const err = await signUp(email.trim(), password, user, name.trim(), true)
    setBusy(false)
    if (err) { setError(err); return }
    setMode('verify')
  }

  const matches = confirmPw.length > 0 && confirmPw === password

  return (
    <AuthShell side={COMMUNITY_SIDE}>
      {mode === 'verify' ? (
        <CodeStep
          email={email.trim()}
          onVerified={async () => { await reloadProfile(); navigate(next, { replace: true }) }}
          onBack={() => setMode('signup')}
        />
      ) : mode === 'forgot' ? (
        <ForgotPassword
          initialEmail={email.trim()}
          onBack={() => setMode('signin')}
          onDone={() => { setPassword(''); setError(''); setNotice('Your password was changed. Sign in with your new password.'); setMode('signin') }}
        />
      ) : (
        <>
          <div className="auth-tabs" role="tablist">
            <button role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'on' : ''} type="button" onClick={() => { setMode('signin'); setError('') }}>Sign in</button>
            <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} type="button" onClick={() => { setMode('signup'); setError(''); setNotice('') }}>Create account</button>
          </div>
          {mode === 'signin' ? (
            <form onSubmit={signin}>
              <h1>Welcome back</h1>
              <p className="auth-sub">Sign in to post, like, comment and follow.</p>
              {notice ? <p className="hint ok auth-notice">{notice}</p> : null}
              <Field label="Email" icon={<Mail size={17} />}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </Field>
              <Field label="Password" icon={<Lock size={17} />}>
                <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
              </Field>
              <div className="forgot-row">
                <button className="link" type="button" onClick={() => { setError(''); setNotice(''); setMode('forgot') }}>Forgot password?</button>
              </div>
              {error ? <p className="err">{error}</p> : null}
              <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            </form>
          ) : (
            <form onSubmit={signup}>
              <h1>Create your account</h1>
              <p className="auth-sub">Free, and only takes a minute. We'll email you a code to confirm it's you.</p>
              <Field label="Name" icon={<User size={17} />}>
                <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </Field>
              <Field label="Username" icon={<AtSign size={17} />}>
                <input value={username} maxLength={30} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
              </Field>
              <Field label="Email" icon={<Mail size={17} />}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </Field>
              <Field label="Password" icon={<Lock size={17} />}>
                <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
              </Field>
              <PasswordRules password={password} />
              <Field label="Confirm password" icon={<Lock size={17} />}>
                <PasswordInput value={confirmPw} onChange={setConfirmPw} autoComplete="new-password" />
              </Field>
              {confirmPw ? <p className={matches ? 'hint ok' : 'hint'}>{matches ? 'Passwords match.' : 'Passwords do not match yet.'}</p> : null}
              {error ? <p className="err">{error}</p> : null}
              <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Sending code…' : 'Create account'}</button>
              <p className="auth-foot center muted small">Joining the shelter team? <Link to="/staff-apply">Apply as staff</Link> instead.</p>
            </form>
          )}
        </>
      )}
    </AuthShell>
  )
}
