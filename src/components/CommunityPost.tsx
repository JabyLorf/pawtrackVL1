import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ago } from '../lib/utils'
import { authorLabel, isOfficial, notify } from '../lib/community'
import type { Post, PostComment, PostLike, Profile, Repost } from '../types'
import { Avatar } from './Avatar'
import { useAuth } from '../context/AuthContext'

export function PostMedia({ post, author }: { post: Post; author?: Profile | null }) {
  const hue = author?.avatar_hue ?? 200
  const extra = [
    post.media_type === 'video' ? ' video' : '',
    !post.media_url && post.caption ? ' text' : '',
  ].join('')
  return (
    <div
      className={'media' + extra}
      style={{ background: `linear-gradient(135deg,hsl(${hue} 40% 86%),hsl(${(hue + 40) % 360} 35% 72%))` }}
    >
      {post.media_url ? (
        post.media_type === 'video'
          ? <video src={post.media_url} controls />
          : <img src={post.media_url} alt="" />
      ) : post.caption ? <span>{post.caption}</span> : null}
    </div>
  )
}

export function CommunityPost({
  post,
  author,
  people,
  likes,
  comments,
  reposts,
  followingIds,
  forceComments,
  onChange,
}: {
  post: Post
  author?: Profile | null
  people: Record<string, Profile>
  likes: PostLike[]
  comments: PostComment[]
  reposts: Repost[]
  followingIds: Set<string>
  forceComments?: boolean
  onChange: () => void
}) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(!!forceComments)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [text, setText] = useState('')
  const mine = profile?.id === author?.id
  const liked = likes.some((l) => l.post_id === post.id && l.user_id === profile?.id)
  const didRepost = reposts.some((r) => r.post_id === post.id && r.user_id === profile?.id)
  const likeN = likes.filter((l) => l.post_id === post.id).length
  const repostN = reposts.filter((r) => r.post_id === post.id).length
  const thread = useMemo(
    () => comments.filter((c) => c.post_id === post.id && !c.hidden),
    [comments, post.id],
  )
  const roots = thread.filter((c) => !c.parent_id)

  function goUser(id?: string) {
    if (!id) return
    navigate(id === profile?.id ? '/community/profile' : `/community/u/${id}`)
  }

  async function toggleLike() {
    if (!profile) return
    if (liked) {
      await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', profile.id)
    } else {
      await supabase.from('post_likes').insert({ post_id: post.id, user_id: profile.id })
      if (post.user_id) await notify(profile.id, post.user_id, 'liked your post', { type: 'like', postId: post.id })
    }
    onChange()
  }

  async function toggleRepost() {
    if (!profile) return
    if (didRepost) {
      await supabase.from('reposts').delete().eq('post_id', post.id).eq('user_id', profile.id)
    } else {
      await supabase.from('reposts').insert({ post_id: post.id, user_id: profile.id })
      if (post.user_id) await notify(profile.id, post.user_id, 'reposted your post', { type: 'repost', postId: post.id })
    }
    onChange()
  }

  async function toggleFollow() {
    if (!profile || !author || mine) return
    if (followingIds.has(author.id)) {
      await supabase.from('follows').delete().eq('follower_id', profile.id).eq('following_id', author.id)
    } else {
      await supabase.from('follows').insert({ follower_id: profile.id, following_id: author.id })
      await notify(profile.id, author.id, 'started following you', { type: 'follow' })
    }
    onChange()
  }

  async function report() {
    if (!profile) return
    await supabase.from('reports').insert({
      target: 'post',
      post_id: post.id,
      reported_by: profile.id,
      reason: 'Spam',
    })
    alert('Thanks. Staff will review this post.')
  }

  async function addComment(e: FormEvent) {
    e.preventDefault()
    if (!profile || !text.trim()) return
    await supabase.from('comments').insert({
      post_id: post.id,
      user_id: profile.id,
      parent_id: replyTo,
      text: text.trim(),
    })
    if (post.user_id) await notify(profile.id, post.user_id, 'commented on your post', { type: 'comment', postId: post.id })
    setText('')
    setReplyTo(null)
    setOpen(true)
    onChange()
  }

  function CommentRow({ c, reply }: { c: PostComment; reply?: boolean }) {
    const u = people[c.user_id]
    const kids = thread.filter((k) => k.parent_id === c.id)
    return (
      <div className={'comment' + (reply ? ' reply' : '')}>
        <button className="avatar-hit" type="button" onClick={() => goUser(u?.id)}>{<Avatar user={u} />}</button>
        <div>
          <p><b>{authorLabel(u)}</b> {c.text}</p>
          <div className="comment-meta">
            <span>{ago(c.created_at)}</span>
            <button type="button" onClick={() => { setReplyTo(c.id); setOpen(true) }}>Reply</button>
          </div>
          {kids.length ? <div className="comment-replies">{kids.map((k) => <CommentRow key={k.id} c={k} reply />)}</div> : null}
        </div>
      </div>
    )
  }

  return (
    <article className="ig-post">
      <div className="ig-post-head">
        <button className="avatar-hit" type="button" onClick={() => goUser(author?.id)}><Avatar user={author} /></button>
        <div className="grow">
          <button className="link name-hit" type="button" onClick={() => goUser(author?.id)}><b>{authorLabel(author)}</b></button>
          {' · '}
          <span className="muted">{ago(post.created_at)}</span>
          {isOfficial(author) ? <> <span className="official">Official</span></> : null}
        </div>
        {!mine && author ? (
          <button className="link" type="button" onClick={toggleFollow}>
            {followingIds.has(author.id) ? 'Following' : 'Follow'}
          </button>
        ) : null}
      </div>
      <PostMedia post={post} author={author} />
      <div className="ig-post-body">
        <div className="feed-actions">
          <button className="btn btn-ghost" type="button" onClick={toggleLike}>{liked ? '♥' : '♡'} {likeN}</button>
          <button className="btn btn-ghost" type="button" onClick={() => setOpen((v) => !v)}>● {thread.length}</button>
          <button className="btn btn-ghost" type="button" onClick={toggleRepost}>↗ {repostN}</button>
          <button className="btn btn-ghost" type="button" onClick={report}>Report</button>
        </div>
        {post.caption ? <p className="feed-caption"><b>{authorLabel(author)}</b> {post.caption}</p> : null}
        <div className="comments-wrap">
          {!forceComments ? (
            <button className="link comment-toggle" type="button" onClick={() => setOpen((v) => !v)}>
              {open ? (thread.length ? 'Hide comments' : 'No comments yet') : (thread.length ? `View ${thread.length} comment${thread.length === 1 ? '' : 's'}` : 'Add a comment')}
            </button>
          ) : null}
          {open || forceComments ? (
            <>
              {roots.length ? roots.map((c) => <CommentRow key={c.id} c={c} />) : <p className="empty">No comments yet.</p>}
              {replyTo ? (
                <div className="reply-banner">
                  Replying
                  <button className="link" type="button" onClick={() => setReplyTo(null)}>Cancel</button>
                </div>
              ) : null}
              <form className="row comment-add" onSubmit={addComment}>
                <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'} />
                <button className="btn btn-coral" type="submit">Post</button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </article>
  )
}
