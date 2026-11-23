import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { PublicLayout } from '../components/PublicLayout'
import { Modal } from '../components/Modal'
import { CheckCircle2, Send } from 'lucide-react'

export function DonatePage() {
  const [amount, setAmount] = useState('500')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [purpose, setPurpose] = useState('General Fund')
  const [method, setMethod] = useState('GCash')
  const [message, setMessage] = useState('')
  const [flash, setFlash] = useState('')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!amount || !name) { setError('Enter an amount and your name.'); return }
    const { error: err } = await supabase.from('donations').insert({
      name, email, amount: Number(amount), purpose, method, message,
    })
    if (err) { setError(err.message); return }
    setError('')
    setFlash('OSO-' + Date.now().toString().slice(-6))
  }

  return (
    <PublicLayout>
      <section className="block">
        <div className="container">
          <div className="section-head">
            <p className="kicker">Your gift, their hope</p>
            <h2>Every peso helps feed, heal, and save a life</h2>
          </div>
          <div className="split">
            <div>
              <h3>Where your donation goes</h3>
              <ul className="ticks">
                <li><span><b>Dog food & supplies</b> — daily meals for the dogs in our care.</span></li>
                <li><span><b>Veterinary care</b> — treatment, vaccines, deworming, and emergency rescues.</span></li>
                <li><span><b>Spay & neuter program</b> — the long-term fix for stray overpopulation.</span></li>
                <li><span><b>Shelter upkeep</b> — kennels, bedding, and clean water at the City Dog Pound.</span></li>
              </ul>
            </div>
            <form className="card-panel" onSubmit={submit}>
              <h3>Send a gift</h3>
              <p className="muted">Your gift is added to the donation total right away.</p>
              <div className="amount-grid">
                {['250', '500', '1000', '2500'].map((n) => (
                  <button type="button" key={n} className={amount === n ? 'on' : ''} onClick={() => setAmount(n)}>₱{Number(n).toLocaleString()}</button>
                ))}
              </div>
              <label>Amount (PHP) *</label>
              <input type="number" min={20} value={amount} onChange={(e) => setAmount(e.target.value)} />
              <label>Full name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <label>Purpose</label>
              <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                {['General Fund', 'Dog Food & Supplies', 'Veterinary Care', 'Spay & Neuter Program', 'Shelter Upkeep'].map((p) => <option key={p}>{p}</option>)}
              </select>
              <label>Payment method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {['GCash', 'Bank Transfer', 'Cash / Walk-in', 'In-kind Donation'].map((p) => <option key={p}>{p}</option>)}
              </select>
              <label>Message (optional)</label>
              <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
              {error ? <p className="err">{error}</p> : null}
              {flash ? <p className="ok">Thank you — your donation was received. Reference: <b>{flash}</b></p> : null}
              <button className="btn btn-accent btn-block btn-pill" type="submit">Donate now</button>
            </form>
          </div>
        </div>
      </section>
    </PublicLayout>
  )
}

export function AboutPage() {
  return (
    <PublicLayout>
      <section className="block">
        <div className="container">
          <div className="section-head">
            <p className="kicker">About us</p>
            <h2>Every life deserves a chance</h2>
            <p className="muted">Ormoc Strays Oasis is a non-profit animal rescue and rehabilitation group based in Ormoc City, Leyte.</p>
          </div>
        </div>
      </section>
    </PublicLayout>
  )
}

export function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('General')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState<'form' | 'confirm' | 'sent'>('form')
  const [busy, setBusy] = useState(false)

  function review(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !text.trim()) { setError('Name and message are required.'); return }
    setError('')
    setStep('confirm')
  }

  async function send() {
    setBusy(true)
    const { error: err } = await supabase.from('inbox_messages').insert({
      name: name.trim(), email: email.trim(), subject: subject.trim() || 'General', body: text.trim(), kind: 'contact',
    })
    setBusy(false)
    if (err) { setStep('form'); setError(err.message); return }
    setStep('sent')
    setName('')
    setEmail('')
    setSubject('General')
    setText('')
  }

  return (
    <PublicLayout>
      <section className="block">
        <div className="container split">
          <form className="card-panel" onSubmit={review}>
            <h3>Send us a message</h3>
            <label>Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
            <label>Message *</label>
            <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
            {error ? <p className="err">{error}</p> : null}
            <button className="btn btn-primary btn-block" type="submit"><Send size={17} /> Send message</button>
          </form>
          <div className="card-panel">
            <h3>Visit us</h3>
            <p>Brgy. Cagbuhangin, Ormoc City</p>
            <p>0946 468 0043</p>
            <p>ormocstraysoasis@gmail.com</p>
            <p className="muted">Open everyday 9AM–10PM</p>
          </div>
        </div>
      </section>
      {step === 'confirm' ? (
        <Modal onClose={() => { if (!busy) setStep('form') }}>
          <div className="dialog">
            <div className="auth-icon"><Send size={22} /></div>
            <h2>Send this message?</h2>
            <p className="auth-sub">Please check your message. You can't change it after it's sent.</p>
            <div className="adopt-review">
              <div><span>Name</span><b>{name}</b></div>
              {email ? <div><span>Email</span><b>{email}</b></div> : null}
              <div><span>Subject</span><b>{subject || 'General'}</b></div>
            </div>
            <p className="dialog-quote">{text}</p>
            <div className="dialog-actions">
              <button className="btn btn-light" type="button" disabled={busy} onClick={() => setStep('form')}>Edit message</button>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Yes, send it'}</button>
            </div>
          </div>
        </Modal>
      ) : null}
      {step === 'sent' ? (
        <Modal onClose={() => setStep('form')}>
          <div className="dialog center">
            <div className="auth-icon success"><CheckCircle2 size={26} /></div>
            <h2>Your message has been sent</h2>
            <p className="auth-sub">Thank you! Our staff will read it and get back to you as soon as they can.</p>
            <button className="btn btn-primary btn-block" type="button" onClick={() => setStep('form')}>OK</button>
          </div>
        </Modal>
      ) : null}
    </PublicLayout>
  )
}
