import { useState, type FormEvent } from 'react'
import { supabase, publicUrl } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function CreatePost({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { profile } = useAuth()
  const [caption, setCaption] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function pick(next: File | null) {
    setFile(next)
    setPreview(next ? URL.createObjectURL(next) : '')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    if (!caption.trim() && !file) { setError('Write something or add a photo.'); return }
    setBusy(true)
    setError('')
    let mediaUrl = ''
    let mediaType: 'photo' | 'video' = 'photo'
    if (file) {
      mediaType = file.type.startsWith('video') ? 'video' : 'photo'
      const path = `${profile.id}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`
      const { error: upErr } = await supabase.storage.from('post-media').upload(path, file)
      if (upErr) { setBusy(false); setError(upErr.message); return }
      mediaUrl = publicUrl('post-media', path)
    }
    const { error: err } = await supabase.from('posts').insert({
      user_id: profile.id,
      caption: caption.trim(),
      media_url: mediaUrl,
      media_type: mediaType,
    })
    setBusy(false)
    if (err) { setError(err.message); return }
    onCreated()
    onClose()
  }

  return (
    <div className="modal create-modal" onClick={onClose} role="presentation">
      <form className="create-card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="create-head">
          <b>Create a post</b>
          <button className="chat-x" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <textarea
          rows={4}
          placeholder="Write something, or add a photo…"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
        <div className={'create-preview' + (preview ? ' on' : '')}>
          {file?.type.startsWith('video') ? <video src={preview} controls /> : preview ? <img src={preview} alt="" /> : null}
        </div>
        <div className="create-actions">
          <label className="btn btn-light">
            Add photo
            <input type="file" accept="image/*,video/*" hidden onChange={(e) => pick(e.target.files?.[0] || null)} />
          </label>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-coral" type="submit" disabled={busy}>{busy ? 'Sharing…' : 'Share'}</button>
        </div>
        {error ? <p className="err" style={{ padding: '0 16px 12px' }}>{error}</p> : null}
      </form>
    </div>
  )
}
