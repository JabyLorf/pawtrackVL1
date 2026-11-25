import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'

// Android back-button handlers for open forms (newest last). AppBackHandler
// calls the newest one first, so back closes the form instead of the page.
const backHandlers: Array<() => void> = []

/** Called by AppBackHandler; returns true when an open form handled back. */
export function handleFormBack() {
  const top = backHandlers[backHandlers.length - 1]
  if (!top) return false
  top()
  return true
}

/**
 * Asks "Cancel this?" before leaving a form that has unsaved input:
 * links, the browser/Android back button, reloading or closing the tab.
 *
 * - Render `leaveDialog` in the component.
 * - Call `allowLeave()` right before navigating away on purpose (after saving).
 * - For a form in a popup, pass `onClose`: Android back then closes the popup,
 *   and `confirmLeave(onClose)` asks first when the form has input.
 */
export function useLeaveGuard(dirty: boolean, opts: { what?: string; onClose?: () => void } = {}) {
  const what = opts.what || 'this'
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const allowed = useRef(false)
  const [pending, setPending] = useState<null | (() => void)>(null)

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        dirtyRef.current &&
        !allowed.current &&
        (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
      [],
    ),
  )

  // Reloading or closing the tab: the browser shows its own "Leave site?" box.
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  const confirmLeave = useCallback((action: () => void) => {
    if (dirtyRef.current && !allowed.current) setPending(() => action)
    else action()
  }, [])

  const onClose = opts.onClose
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!onClose) return
    const handler = () => {
      const close = closeRef.current
      if (close) confirmLeave(close)
    }
    backHandlers.push(handler)
    return () => {
      const i = backHandlers.lastIndexOf(handler)
      if (i >= 0) backHandlers.splice(i, 1)
    }
  }, [!!onClose, confirmLeave]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = blocker.state === 'blocked' || pending !== null
  const stay = () => {
    if (blocker.state === 'blocked') blocker.reset()
    setPending(null)
  }
  const leave = () => {
    allowed.current = true
    if (blocker.state === 'blocked') blocker.proceed()
    const action = pending
    setPending(null)
    action?.()
    // A popup form stays mounted after "leave" only if the action failed; re-arm.
    setTimeout(() => { allowed.current = false }, 0)
  }

  const leaveDialog = open ? (
    <Modal onClose={stay}>
      <div className="dialog center">
        <div className="auth-icon warn"><AlertTriangle size={22} /></div>
        <h2>Cancel {what}?</h2>
        <p className="auth-sub">What you have entered so far will be lost.</p>
        <div className="dialog-actions">
          <button className="btn btn-light" type="button" onClick={stay}>Keep going</button>
          <button className="btn btn-danger" type="button" onClick={leave}>Yes, cancel</button>
        </div>
      </div>
    </Modal>
  ) : null

  return {
    leaveDialog,
    confirmLeave,
    allowLeave: () => { allowed.current = true },
  }
}
