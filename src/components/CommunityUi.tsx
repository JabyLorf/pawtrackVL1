import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { BadgeCheck } from 'lucide-react'
import { SITE_URL } from '../lib/app'
import type { Person } from '../types'

export function friendly(message: string) {
  if (/row-level security|violates/i.test(message)) return 'You need to be signed in to do that.'
  return message
}

/** Opens the phone's share menu, or copies the link; returns a short message to show. */
export async function share(title: string, path: string): Promise<string> {
  const url = `${SITE_URL}${path}`
  try {
    if (navigator.share) {
      await navigator.share({ title, url })
      return ''
    }
    await navigator.clipboard.writeText(url)
    return 'Link copied'
  } catch {
    return ''
  }
}

export function Name({ p, link = true }: { p: Pick<Person, 'username' | 'display_name' | 'is_shelter'>; link?: boolean }) {
  const inner = (
    <>
      <b>{p.display_name}</b>
      {p.is_shelter ? <BadgeCheck size={15} className="shelter-badge" aria-label="Ormoc Strays Oasis team" /> : null}
    </>
  )
  return link ? <Link className="name-link" to={`/community/u/${p.username}`}>{inner}</Link> : <span className="name-link">{inner}</span>
}

export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    if (!text) return
    const t = setTimeout(onDone, 2200)
    return () => clearTimeout(t)
  }, [text, onDone])
  return text ? createPortal(<div className="toast" role="status">{text}</div>, document.body) : null
}

/** Sends visitors to the join page, then back here afterwards. */
export function useJoin() {
  const navigate = useNavigate()
  return () => navigate(`/join?next=${encodeURIComponent(window.location.pathname)}`)
}
