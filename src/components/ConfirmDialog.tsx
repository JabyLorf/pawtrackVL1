import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Modal } from './Modal'

/**
 * "Are you sure?" dialog. onConfirm may return an error message to show;
 * the dialog stays open (and locked) while it runs, so it can't fire twice.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busyLabel = 'Working…',
  danger,
  onConfirm,
  onClose,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  busyLabel?: string
  danger?: boolean
  onConfirm: () => Promise<string | null | void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const running = useRef(false)

  async function go() {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    const err = await onConfirm()
    running.current = false
    setBusy(false)
    if (err) setError(err)
  }

  // On <body>, so it shows above other popups and isn't styled by its parent.
  return createPortal(
    <Modal onClose={() => { if (!running.current) onClose() }}>
      <div className="dialog">
        <div className={'auth-icon' + (danger ? ' danger' : ' warn')}><AlertTriangle size={22} /></div>
        <h2>{title}</h2>
        <div className="auth-sub">{children}</div>
        {error ? <p className="err">{error}</p> : null}
        <div className="dialog-actions">
          <button className="btn btn-light" type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')} type="button" disabled={busy} onClick={go}>
            {busy ? <><Loader2 size={16} className="spin" /> {busyLabel}</> : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>,
    document.body,
  )
}

type ConfirmRequest = {
  title: string
  body: ReactNode
  confirmLabel: string
  busyLabel?: string
  danger?: boolean
  /** Runs after the user confirms; return an error message to keep the dialog open. */
  action: () => Promise<string | null | void> | string | null | void
}

/**
 * Ask before doing something: `confirm({ title, body, confirmLabel, action })`.
 * Render `dialog` somewhere in the component.
 */
export function useConfirm() {
  const [req, setReq] = useState<ConfirmRequest | null>(null)
  const dialog = req ? (
    <ConfirmDialog
      title={req.title}
      confirmLabel={req.confirmLabel}
      busyLabel={req.busyLabel}
      danger={req.danger}
      onClose={() => setReq(null)}
      onConfirm={async () => {
        const err = await req.action()
        if (!err) setReq(null)
        return err
      }}
    >
      {req.body}
    </ConfirmDialog>
  ) : null
  return { confirm: setReq as (r: ConfirmRequest) => void, dialog }
}
