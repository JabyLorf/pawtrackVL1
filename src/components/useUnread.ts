import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const EVENT = 'pawtrack:unread'

/** Ask every header badge to refresh now (e.g. after reading a chat). */
export function refreshUnread() {
  window.dispatchEvent(new Event(EVENT))
}

/** Unread notifications and chats for the signed-in member; refreshes every 30 s. */
export function useUnread() {
  const { canPost } = useAuth()
  const { pathname } = useLocation()
  const [counts, setCounts] = useState({ notifications: 0, chats: 0 })

  useEffect(() => {
    if (!canPost) { setCounts({ notifications: 0, chats: 0 }); return }
    let alive = true
    const load = () => {
      supabase.rpc('unread_counts').then(({ data }) => {
        const row = (data as { notifications: number; chats: number }[] | null)?.[0]
        if (alive && row) setCounts(row)
      })
    }
    load()
    const timer = setInterval(load, 30000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(EVENT, load)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(EVENT, load)
    }
  }, [canPost, pathname])

  return counts
}
