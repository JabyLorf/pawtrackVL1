import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Dog } from '../types'
import { Modal } from './Modal'
import { useLeaveGuard } from './useLeaveGuard'

export function AdoptForm({ dog, onClose }: { dog: Dog; onClose: () => void }) {
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [idFile, setIdFile] = useState<File | null>(null)
  const [idPreview, setIdPreview] = useState('')
  const [draft, setDraft] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    home: 'House with yard',
    pets: 'None',
    note: '',
  })

  const dirty = step !== 'done' && !!(draft.name.trim() || draft.email.trim() || draft.phone.trim() || draft.address.trim() || draft.note.trim() || idFile)
  const { leaveDialog, confirmLeave } = useLeaveGuard(dirty, { what: 'this adoption request', onClose })
  const close = () => confirmLeave(onClose)

  function onId(file: File | null) {
    setIdFile(file)
    if (!file) { setIdPreview(''); return }
    const reader = new FileReader()
    reader.onload = () => setIdPreview(String(reader.result))
    reader.readAsDataURL(file)
  }

  function review(e: FormEvent) {
    e.preventDefault()
    if (!draft.name) return setError('Please enter the full name of the person who wants to adopt.')
    if (!draft.phone) return setError('A telephone number is required.')
    if (!draft.address) return setError('Please enter your address.')
    if (!draft.note) return setError('Please note who wants to adopt this pet.')
    if (!idFile) return setError('Please upload a photo of a valid ID.')
    setError('')
    setStep('confirm')
  }

  async function submit() {
    if (!idFile) return
    setBusy(true)
    setError('')
    const full = `Sorry, ${dog.name} already has 5 adoption requests being reviewed. Please check back later.`
    const { data: open } = await supabase.rpc('adoption_open', { p_dog: dog.id })
    if (open === false) { setBusy(false); setError(full); return }
    const path = `${crypto.randomUUID()}-${idFile.name.replace(/\s+/g, '-')}`
    const { error: upErr } = await supabase.storage.from('id-photos').upload(path, idFile)
    if (upErr) {
      setBusy(false)
      setError(upErr.message)
      return
    }
    const { error: insErr } = await supabase.from('adoptions').insert({
      dog_id: dog.id,
      applicant: draft.name,
      email: draft.email,
      phone: draft.phone,
      address: draft.address,
      home: draft.home,
      pets: draft.pets,
      note: draft.note,
      id_photo_url: path,
    })
    setBusy(false)
    if (insErr) {
      setError(/row-level security|5 adoption requests/i.test(insErr.message) ? full : insErr.message)
      return
    }
    setStep('done')
  }

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div><span>{label}</span><b>{value || '—'}</b></div>
  )

  return (
    <>
    <Modal onClose={close}>
      <div className="create-head">
        <b>{step === 'done' ? 'Application submitted' : `Adopt ${dog.name}`}</b>
        <button className="chat-x" type="button" onClick={close} aria-label="Close"><X size={18} /></button>
      </div>
      <div className="adopt-card-body">
        {step === 'form' ? (
          <form onSubmit={review}>
            <p className="muted">A telephone number, a photo of a valid ID, and a note naming who wants to adopt {dog.name} are required.</p>
            {error ? <p className="err">{error}</p> : null}
            <label>Full name *</label>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
            <div className="form-grid">
              <div>
                <label>Email</label>
                <input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </div>
              <div>
                <label>Telephone number *</label>
                <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} required placeholder="09•• ••• ••••" />
              </div>
              <div className="full">
                <label>Address *</label>
                <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} required />
              </div>
              <div>
                <label>Type of home</label>
                <select value={draft.home} onChange={(e) => setDraft({ ...draft, home: e.target.value })}>
                  {['House with yard', 'House', 'Apartment', 'Condo', 'Other'].map((h) => <option key={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label>Other pets</label>
                <select value={draft.pets} onChange={(e) => setDraft({ ...draft, pets: e.target.value })}>
                  {['None', 'Dogs', 'Cats', 'Dogs and cats', 'Other'].map((h) => <option key={h}>{h}</option>)}
                </select>
              </div>
              <div className="full">
                <label>Who wants to adopt this pet? *</label>
                <p className="crop-field-hint">Name the person who will care for this dog, and your relationship if you are applying for someone else.</p>
                <textarea rows={3} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} required />
              </div>
              <div className="full">
                <label>Photo of valid ID *</label>
                <p className="crop-field-hint">Upload a clear photo of a government-issued ID.</p>
                <input type="file" accept="image/*" onChange={(e) => onId(e.target.files?.[0] || null)} />
                <div className={'adopt-id-preview' + (idPreview ? ' on' : '')}>
                  {idPreview ? <img src={idPreview} alt="Valid ID" /> : <span>No ID photo yet</span>}
                </div>
              </div>
            </div>
            <button className="btn btn-accent btn-block btn-pill" style={{ marginTop: 16 }} type="submit">Review application</button>
          </form>
        ) : null}
        {step === 'confirm' ? (
          <div>
            <p>Confirm you want to adopt <b>{dog.name}</b>.</p>
            {error ? <p className="err">{error}</p> : null}
            <div className="adopt-review">
              <Row label="Name" value={draft.name} />
              <Row label="Telephone" value={draft.phone} />
              <Row label="Who wants to adopt" value={draft.note} />
            </div>
            {idPreview ? <div className="adopt-id-preview on" style={{ marginTop: 12 }}><img src={idPreview} alt="Valid ID" /></div> : null}
            <div className="row wrap" style={{ marginTop: 16 }}>
              <button className="btn btn-light btn-pill" type="button" onClick={() => setStep('form')}>Edit</button>
              <button className="btn btn-accent btn-pill" type="button" disabled={busy} onClick={submit}>
                {busy ? 'Submitting…' : 'Yes, submit application'}
              </button>
            </div>
          </div>
        ) : null}
        {step === 'done' ? (
          <div>
            <h3>Application submitted</h3>
            <p className="muted">Staff will reach you at {draft.phone}. A valid ID photo was attached.</p>
            <button className="btn btn-light btn-pill" type="button" onClick={close}>Close</button>
          </div>
        ) : null}
      </div>
    </Modal>
    {leaveDialog}
    </>
  )
}
