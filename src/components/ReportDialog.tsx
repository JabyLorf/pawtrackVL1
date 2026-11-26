import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Flag, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Modal } from './Modal'

export type ReportKind = 'post' | 'comment' | 'user' | 'message'

const REASONS = ['Spam', 'Harassment or bullying', 'Animal cruelty', 'Inappropriate content', 'Scam or fraud', 'Other'] as const

const WHAT: Record<ReportKind, string> = {
  post: 'this post',
  comment: 'this comment',
  user: 'this account',
  message: 'this message',
}

/** "Report …" form. The PawTrack team reviews every report on the staff desk. */
export function ReportDialog({ kind, id, onClose }: { kind: ReportKind; id: string; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!reason) { setError('Choose a reason.'); return }
    setBusy(true)
    setError('')
    const { error: err } = await supabase.rpc('submit_report', { p_kind: kind, p_id: id, p_reason: reason, p_details: details })
    setBusy(false)
    if (err) { setError(err.message); return }
    setDone(true)
  }

  // On <body>, so a report opened from a popup or card isn't styled by it.
  return createPortal(
    <Modal onClose={() => { if (!busy) onClose() }}>
      {done ? (
        <div className="dialog center">
          <div className="auth-icon"><CheckCircle2 size={22} /></div>
          <h2>Thanks for telling us</h2>
          <p className="auth-sub">The PawTrack team will review it. The person won't know who reported them.</p>
          <div className="dialog-actions"><button className="btn btn-primary" type="button" onClick={onClose}>Done</button></div>
        </div>
      ) : (
        <form className="dialog report-form" onSubmit={submit}>
          <div className="auth-icon danger"><Flag size={20} /></div>
          <h2>Report {WHAT[kind]}</h2>
          <p className="auth-sub">Why are you reporting it? Your report is private.</p>
          <div className="reason-list" role="radiogroup">
            {REASONS.map((r) => (
              <label key={r} className={'reason' + (reason === r ? ' on' : '')}>
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {r}
              </label>
            ))}
          </div>
          <label htmlFor="report-details">More details (optional)</label>
          <textarea id="report-details" rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
          {error ? <p className="err">{error}</p> : null}
          <div className="dialog-actions">
            <button className="btn btn-light" type="button" disabled={busy} onClick={onClose}>Cancel</button>
            <button className="btn btn-danger" type="submit" disabled={busy}>
              {busy ? <><Loader2 size={16} className="spin" /> Sending…</> : 'Send report'}
            </button>
          </div>
        </form>
      )}
    </Modal>,
    document.body,
  )
}
