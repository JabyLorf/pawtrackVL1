import { useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { PublicLayout } from '../components/PublicLayout'
import { Modal } from '../components/Modal'
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Download, HeartHandshake, Loader2, Send } from 'lucide-react'

const PURPOSES = ['General Fund', 'Dog Food & Supplies', 'Veterinary Care', 'Spay & Neuter Program', 'Shelter Upkeep']
// Where donors can send money. Shown on the "Scan & pay" step.
const ACCOUNTS = [
  { id: 'GCash', label: 'GCash', qr: '/gcash-qr.png', number: '0992 724 0539', raw: '09927240539', numberLabel: 'GCash number', name: 'Jarry Bendijo' },
  { id: 'GoTyme', label: 'GoTyme Bank', qr: '/gotyme-qr.png', number: '0187 9858 3754', raw: '018798583754', numberLabel: 'Account number', name: 'Jarry Bendijo' },
] as const

const METHODS: Array<[string, string]> = [
  ['GCash', 'GCash'],
  ['GoTyme', 'GoTyme Bank'],
  ['Bank Transfer', 'Other bank / InstaPay'],
  ['Cash / Walk-in', 'Cash at the shelter'],
  ['In-kind Donation', 'Food or supplies (in-kind)'],
]

export function DonatePage() {
  const [step, setStep] = useState<'pay' | 'details' | 'done'>('pay')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('GCash')
  const [account, setAccount] = useState<(typeof ACCOUNTS)[number]['id']>('GCash')
  const [copied, setCopied] = useState(false)
  const acct = ACCOUNTS.find((a) => a.id === account)!
  const [reference, setReference] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [purpose, setPurpose] = useState('General Fund')
  const [message, setMessage] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)

  const needsRef = method === 'GCash' || method === 'GoTyme' || method === 'Bank Transfer'
  const amountOk = /^[1-9]\d{0,5}$/.test(amount)
  const refOk = !needsRef || reference.replace(/\s/g, '').length >= 6
  const ready = amountOk && refOk

  const [confirming, setConfirming] = useState(false)

  function review(e: FormEvent) {
    e.preventDefault()
    if (!amountOk) { setError('Enter the amount you sent.'); return }
    if (!refOk) { setError('Enter the reference number from your GCash or bank receipt.'); return }
    setError('')
    setConfirming(true)
  }

  async function submit() {
    if (sending.current) return
    if (!amountOk) { setError('Enter the amount you sent.'); return }
    if (!refOk) { setError('Enter the reference number from your GCash or bank receipt.'); return }
    sending.current = true
    setBusy(true)
    setError('')
    let receipt_path = ''
    if (receipt) {
      const path = `${crypto.randomUUID()}-${receipt.name.replace(/[^\w.-]+/g, '-')}`
      const { error: upErr } = await supabase.storage.from('donation-receipts').upload(path, receipt)
      if (upErr) { setError(upErr.message); setBusy(false); sending.current = false; return }
      receipt_path = path
    }
    const { error: err } = await supabase.from('donations').insert({
      name: anonymous || !name.trim() ? 'Anonymous' : name.trim(),
      email: email.trim(),
      anonymous: anonymous || !name.trim(),
      amount: Number(amount),
      purpose,
      method,
      reference_no: reference.trim(),
      receipt_path,
      message: message.trim(),
    })
    setBusy(false)
    sending.current = false
    setConfirming(false)
    if (err) { setError(err.message); return }
    setStep('done')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function reset() {
    setAmount(''); setReference(''); setName(''); setEmail(''); setMessage(''); setReceipt(null)
    setAnonymous(false); setPurpose('General Fund'); setMethod('GCash'); setAccount('GCash'); setStep('pay')
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
              <p className="muted" style={{ marginTop: 18 }}>
                Every donation is checked by our staff against the GCash or bank record before it is added to our totals.
              </p>
            </div>

            <div className="card-panel donate-card">
              <ol className="steps" aria-label="Donation steps">
                <li className={step === 'pay' ? 'on' : 'done'}><span>1</span> Scan & pay</li>
                <li className={step === 'details' ? 'on' : step === 'done' ? 'done' : ''}><span>2</span> Your details</li>
                <li className={step === 'done' ? 'on' : ''}><span>3</span> Done</li>
              </ol>

              {step === 'pay' ? (
                <div>
                  <h3>Scan to donate</h3>
                  <p className="muted">Choose where to send, then scan the QR with GCash, GoTyme, Maya or any bank app and enter any amount you like.</p>
                  <div className="pay-tabs" role="tablist" aria-label="Send to">
                    {ACCOUNTS.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        role="tab"
                        aria-selected={account === a.id}
                        className={account === a.id ? 'on' : ''}
                        onClick={() => { setAccount(a.id); setCopied(false) }}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <div className="qr-box" role="tabpanel">
                    <img src={acct.qr} alt={`${acct.label} QR code (InstaPay)`} width={260} height={260} />
                    <dl className="acct">
                      <div><dt>Account name</dt><dd>{acct.name}</dd></div>
                      <div>
                        <dt>{acct.numberLabel}</dt>
                        <dd>
                          {acct.number}
                          <button
                            className="link"
                            type="button"
                            onClick={() => { navigator.clipboard?.writeText(acct.raw).then(() => setCopied(true)).catch(() => {}) }}
                          >
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="qr-actions">
                    <a className="btn btn-light btn-sm" href={acct.qr} download={`PawTrack-${acct.id}-QR.png`}><Download size={15} /> Save QR</a>
                    <span className="muted">On your phone? Save the QR, then use <b>Scan QR → Upload</b> in your app, or send to the number above.</span>
                  </div>
                  <button className="btn btn-primary btn-block" type="button" onClick={() => { setMethod(account); setStep('details') }}>
                    I've sent my donation <ArrowRight size={17} />
                  </button>
                  <button className="link center-link" type="button" onClick={() => { setMethod('Cash / Walk-in'); setStep('details') }}>
                    Giving cash or supplies at the shelter instead?
                  </button>
                </div>
              ) : step === 'details' ? (
                <form onSubmit={review}>
                  <h3>Tell us about your donation</h3>
                  <p className="muted">So our staff can match it with the payment.</p>

                  <label htmlFor="d-method">How did you give?</label>
                  <select id="d-method" value={method} onChange={(e) => setMethod(e.target.value)}>
                    {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>

                  <label htmlFor="d-amount">Amount you {method === 'In-kind Donation' ? 'estimate' : 'sent'} *</label>
                  <div className="peso-input">
                    <span aria-hidden="true">₱</span>
                    <input
                      id="d-amount"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0"
                     
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6))}
                    />
                  </div>
                  <p className="hint">Type the exact amount in pesos, up to ₱999,999.</p>

                  {needsRef ? (
                    <>
                      <label htmlFor="d-ref">Reference number *</label>
                      <input id="d-ref" inputMode="numeric" placeholder="e.g. 1234 567 890123" value={reference} onChange={(e) => setReference(e.target.value)} />
                      <p className="hint">Found on your GCash or bank receipt after paying.</p>
                    </>
                  ) : null}

                  <label className="check" style={{ marginTop: 14 }}>
                    <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Give anonymously
                  </label>
                  {!anonymous ? (
                    <>
                      <label htmlFor="d-name">Your name <span className="muted">(optional)</span></label>
                      <input id="d-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                    </>
                  ) : null}
                  <label htmlFor="d-email">Email <span className="muted">(optional, for a thank-you)</span></label>
                  <input id="d-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

                  <label htmlFor="d-purpose">Use my gift for</label>
                  <select id="d-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                    {PURPOSES.map((p) => <option key={p}>{p}</option>)}
                  </select>

                  {needsRef ? (
                    <>
                      <label htmlFor="d-receipt">Receipt screenshot <span className="muted">(optional)</span></label>
                      <input id="d-receipt" type="file" accept="image/*" onChange={(e) => setReceipt(e.target.files?.[0] || null)} />
                    </>
                  ) : null}

                  <label htmlFor="d-msg">Message <span className="muted">(optional)</span></label>
                  <textarea id="d-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />

                  <div className={'ready' + (ready ? ' on' : '')} role="status" aria-live="polite">
                    {ready
                      ? <><CheckCircle2 size={18} /> Ready to submit</>
                      : <><Circle size={18} /> {!amountOk ? 'Add the amount' : 'Add the reference number'} to continue</>}
                  </div>
                  {error ? <p className="err">{error}</p> : null}
                  <div className="dialog-actions">
                    <button className="btn btn-light" type="button" disabled={busy} onClick={() => setStep('pay')}><ArrowLeft size={16} /> Back</button>
                    <button className="btn btn-primary" type="submit" disabled={busy || !ready}>
                      {busy ? <><Loader2 size={16} className="spin" /> Submitting…</> : 'Submit donation'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="donate-done">
                  <div className="auth-icon success"><HeartHandshake size={26} /></div>
                  <h3>Thank you for your kindness!</h3>
                  <p className="muted">
                    We received your donation details. Our staff will check it against the {needsRef ? 'payment record' : 'shelter log'} and
                    add it to our totals once confirmed.{email.trim() ? ' A thank-you note is on its way to your email.' : ''}
                  </p>
                  <button className="btn btn-light btn-block" type="button" onClick={reset}>Make another donation</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      {confirming ? (
        <Modal onClose={() => { if (!busy) setConfirming(false) }}>
          <div className="dialog">
            <div className="auth-icon"><HeartHandshake size={22} /></div>
            <h2>Submit this donation?</h2>
            <p className="auth-sub">Please check the details. Our staff will match them with the payment.</p>
            <div className="adopt-review">
              <div><span>Amount</span><b>₱{Number(amount).toLocaleString('en-PH')}</b></div>
              <div><span>Paid with</span><b>{METHODS.find(([v]) => v === method)?.[1] || method}</b></div>
              {needsRef ? <div><span>Reference no.</span><b>{reference.trim()}</b></div> : null}
              <div><span>Name</span><b>{anonymous || !name.trim() ? 'Anonymous' : name.trim()}</b></div>
              {email.trim() ? <div><span>Email</span><b>{email.trim()}</b></div> : null}
              <div><span>For</span><b>{purpose}</b></div>
            </div>
            {error ? <p className="err">{error}</p> : null}
            <div className="dialog-actions">
              <button className="btn btn-light" type="button" disabled={busy} onClick={() => setConfirming(false)}>Edit</button>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={submit}>
                {busy ? <><Loader2 size={16} className="spin" /> Submitting…</> : 'Yes, submit'}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
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
