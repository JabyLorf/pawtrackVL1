import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { App } from '@capacitor/app'
import { LogOut } from 'lucide-react'
import { isNativeApp } from '../lib/app'
import { Modal } from './Modal'

// Pages where Android's back button would leave the app instead of going back.
const ROOTS = new Set(['/', '/ops', '/staff-login'])

/**
 * Android app only: the hardware/gesture back button goes back a page, and on
 * a top-level page asks "Exit PawTrack?" instead of closing straight away.
 */
export function AppBackHandler() {
  const navigate = useNavigate()
  const location = useLocation()
  const [asking, setAsking] = useState(false)
  const state = useRef({ path: location.pathname, asking })
  state.current = { path: location.pathname, asking }

  useEffect(() => {
    if (!isNativeApp) return
    const sub = App.addListener('backButton', ({ canGoBack }) => {
      const { path, asking: open } = state.current
      if (open) { setAsking(false); return }
      if (canGoBack && !ROOTS.has(path)) { navigate(-1); return }
      setAsking(true)
    })
    return () => { sub.then((h) => h.remove()) }
  }, [navigate])

  if (!asking) return null
  return (
    <Modal onClose={() => setAsking(false)}>
      <div className="dialog center">
        <div className="auth-icon warn"><LogOut size={22} /></div>
        <h2>Exit PawTrack?</h2>
        <p className="auth-sub">Do you want to close the app?</p>
        <div className="dialog-actions">
          <button className="btn btn-light" type="button" onClick={() => setAsking(false)}>Stay</button>
          <button className="btn btn-primary" type="button" onClick={() => App.exitApp()}>Exit</button>
        </div>
      </div>
    </Modal>
  )
}
