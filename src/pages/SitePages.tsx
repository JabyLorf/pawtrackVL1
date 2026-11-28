import { useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { PublicLayout } from '../components/PublicLayout'
import { Modal } from '../components/Modal'
import { useLeaveGuard } from '../components/useLeaveGuard'
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, ClipboardList, Download, HandCoins, HeartHandshake, Loader2, Package, Search, Send, Smartphone, Users } from 'lucide-react'
import { GetAppButtons } from '../components/IosInstall'
import { showAppLinks } from '../lib/app'

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
]

// Food & supplies donations: quick picks, then the donor describes amounts.
const GOODS = ['Dog food', 'Treats', 'Medicine & vitamins', 'Blankets & bedding', 'Cleaning supplies', 'Leashes & collars', 'Other']

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Food & supplies" side of the Donate page. */
function GoodsDonation() {
  const [step, setStep] = useState<'form' | 'done'>('form')
  const [kinds, setKinds] = useState<string[]>([])
  const [items, setItems] = useState('')
  const [delivery, setDelivery] = useState<'Drop off' | 'Pick up'>('Drop off')
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)

  const dirty = step === 'form' && !!(kinds.length || items.trim() || name.trim() || phone.trim() || email.trim() || message.trim())
  const { leaveDialog } = useLeaveGuard(dirty, { what: 'this donation' })

  // What the staff see: the ticked kinds plus the donor's own description.
  const summary = [kinds.filter((k) => k !== 'Other').join(', '), items.trim()].filter(Boolean).join(' — ')
  const phoneOk = phone.replace(/\D/g, '').length >= 7

  function review(e: FormEvent) {
    e.preventDefault()
    if (!kinds.length && !items.trim()) { setError('Tell us what you would like to donate.'); return }
    if (!items.trim()) { setError('Describe the items and how much, e.g. "2 sacks of dog food, 20 kg each".'); return }
    if (delivery === 'Pick up' && !phoneOk) { setError('Add a phone number so we can arrange the pick-up.'); return }
    if (phone.trim() && !phoneOk) { setError('Check the phone number.'); return }
    setError('')
    setConfirming(true)
  }

  async function submit() {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError('')
    const { error: err } = await supabase.from('donations').insert({
      name: name.trim() || 'Anonymous',
      anonymous: !name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      amount: value ? Number(value) : 0,
      method: 'In-kind Donation',
      purpose: 'Dog Food & Supplies',
      items: summary.slice(0, 1000),
      delivery,
      preferred_date: date || null,
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
    setKinds([]); setItems(''); setDelivery('Drop off'); setDate(''); setName(''); setPhone(''); setEmail(''); setValue(''); setMessage('')
    setStep('form')
  }

  if (step === 'done') {
    return (
      <div className="donate-done">
        <div className="auth-icon success"><HeartHandshake size={26} /></div>
        <h3>Thank you for your kindness!</h3>
        <p className="muted">
          {delivery === 'Pick up'
            ? 'Our staff will call or text you to arrange the pick-up.'
            : 'You can drop it off at the Ormoc City Dog Pound, Brgy. Cagbuhangin, any day from 9 AM to 10 PM.'}
          {email.trim() ? ' A thank-you note is on its way to your email.' : ''}
        </p>
        <button className="btn btn-light btn-block" type="button" onClick={reset}>Donate something else</button>
      </div>
    )
  }

  return (
    <>
      <form onSubmit={review}>
        <h3>Donate food & supplies</h3>
        <p className="muted">Tell us what you'd like to give. We'll confirm it once it reaches the shelter.</p>

        <label>What are you donating? *</label>
        <div className="goods-chips">
          {GOODS.map((g) => {
            const on = kinds.includes(g)
            return (
              <button key={g} type="button" className={'goods-chip' + (on ? ' on' : '')} aria-pressed={on}
                onClick={() => setKinds((k) => (on ? k.filter((x) => x !== g) : [...k, g]))}>
                {g}
              </button>
            )
          })}
        </div>
        <label htmlFor="g-items">Items and how much *</label>
        <textarea id="g-items" rows={3} maxLength={600} placeholder="e.g. 2 sacks of dog food (20 kg each), 1 box of dewormer" value={items} onChange={(e) => setItems(e.target.value)} />

        <label>How will it reach us?</label>
        <div className="pay-tabs" role="radiogroup">
          <button type="button" role="radio" aria-checked={delivery === 'Drop off'} className={delivery === 'Drop off' ? 'on' : ''} onClick={() => setDelivery('Drop off')}>I'll drop it off</button>
          <button type="button" role="radio" aria-checked={delivery === 'Pick up'} className={delivery === 'Pick up' ? 'on' : ''} onClick={() => setDelivery('Pick up')}>Please pick it up</button>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          {delivery === 'Drop off' ? 'Ormoc City Dog Pound, Brgy. Cagbuhangin · open every day, 9 AM to 10 PM.' : 'Pick-ups are around Ormoc City. Our staff will contact you.'}
        </p>

        <label htmlFor="g-date">{delivery === 'Drop off' ? 'When will you come?' : 'Best day for pick-up'} <span className="muted">(optional)</span></label>
        <input id="g-date" type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} />

        <label htmlFor="g-name">Your name <span className="muted">(optional)</span></label>
        <input id="g-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <label htmlFor="g-phone">Phone {delivery === 'Pick up' ? '*' : <span className="muted">(optional)</span>}</label>
        <input id="g-phone" type="tel" inputMode="tel" maxLength={20} placeholder="09XX XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        <label htmlFor="g-email">Email <span className="muted">(optional, for a thank-you)</span></label>
        <input id="g-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

        <label htmlFor="g-value">Estimated value <span className="muted">(optional)</span></label>
        <div className="peso-input">
          <span aria-hidden="true">₱</span>
          <input id="g-value" inputMode="numeric" autoComplete="off" placeholder="0" value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6))} />
        </div>

        <label htmlFor="g-msg">Message <span className="muted">(optional)</span></label>
        <textarea id="g-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />

        {error ? <p className="err">{error}</p> : null}
        <button className="btn btn-primary btn-block" type="submit" style={{ marginTop: 14 }}>Submit donation</button>
      </form>
      {confirming ? (
        <Modal onClose={() => { if (!busy) setConfirming(false) }}>
          <div className="dialog">
            <div className="auth-icon"><HeartHandshake size={22} /></div>
            <h2>Submit this donation?</h2>
            <p className="auth-sub">Please check the details.</p>
            <div className="adopt-review">
              <div><span>Donating</span><b>{summary}</b></div>
              <div><span>Delivery</span><b>{delivery === 'Drop off' ? "I'll drop it off" : 'Please pick it up'}</b></div>
              {date ? <div><span>Date</span><b>{new Date(`${date}T12:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</b></div> : null}
              <div><span>Name</span><b>{name.trim() || 'Anonymous'}</b></div>
              {phone.trim() ? <div><span>Phone</span><b>{phone.trim()}</b></div> : null}
              {email.trim() ? <div><span>Email</span><b>{email.trim()}</b></div> : null}
              {value ? <div><span>Estimated value</span><b>₱{Number(value).toLocaleString('en-PH')}</b></div> : null}
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
      {leaveDialog}
    </>
  )
}

export function DonatePage() {
  const [gift, setGift] = useState<'money' | 'goods'>('money')
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
  const dirty = gift === 'money' && (step === 'details' || step !== 'done' && !!(amount || reference.trim() || name.trim() || email.trim() || message.trim() || receipt))
  const { leaveDialog } = useLeaveGuard(dirty, { what: 'this donation' })

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
              <div className="gift-tabs" role="tablist" aria-label="What would you like to give?">
                <button type="button" role="tab" aria-selected={gift === 'money'} className={gift === 'money' ? 'on' : ''} onClick={() => setGift('money')}>
                  <HandCoins size={18} /> Money
                </button>
                <button type="button" role="tab" aria-selected={gift === 'goods'} className={gift === 'goods' ? 'on' : ''} onClick={() => setGift('goods')}>
                  <Package size={18} /> Food & supplies
                </button>
              </div>
              {gift === 'goods' ? <GoodsDonation /> : (
              <>
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
                    Giving cash at the shelter instead?
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

                  <label htmlFor="d-amount">Amount you sent *</label>
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
              </>
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
      {leaveDialog}
    </PublicLayout>
  )
}

const PAWTRACK_FEATURES: Array<[typeof Search, string, string]> = [
  [Search, 'Find a dog to adopt', 'Browse the dogs ready for a home, see their photos and details, and send an adoption application.'],
  [HandCoins, 'Donate money or supplies', 'Give through GCash, GoTyme or bank transfer, or offer food and supplies for drop-off or pick-up.'],
  [Users, 'Join the community', 'Share photos of your rescue, follow other dog lovers, comment, and message each other.'],
  [ClipboardList, 'Help the staff', 'Shelter staff keep every dog\'s intake, health, adoption and records in one place.'],
]

export function AboutPage() {
  return (
    <PublicLayout>
      <section className="block">
        <div className="container">
          <div className="section-head">
            <p className="kicker">About us</p>
            <h2>Every life deserves a chance</h2>
            <p className="muted">Ormoc Strays Oasis is a non-profit animal rescue and rehabilitation group based in Ormoc City, Leyte. We take in abandoned, neglected and abused dogs, nurse them back to health, and find them loving homes.</p>
          </div>
          <div className="about-cards">
            <article className="about-card">
              <img src="/about/shelter-mural.webp" alt="The shelter wall in Brgy. Cagbuhangin, painted with portraits of rescued dogs" loading="lazy" width={1000} height={667} />
              <div>
                <h3>Our shelter</h3>
                <p>You'll find us at the Ormoc City Dog Pound in Brgy. Cagbuhangin, behind the wall painted with the faces of dogs we've rescued. Visitors are welcome every day from 9 AM to 10 PM.</p>
              </div>
            </article>
            <article className="about-card">
              <img src="/about/shelter-dogs.webp" alt="Rescued dogs resting and playing together at the shelter" loading="lazy" width={1000} height={667} />
              <div>
                <h3>Our dogs</h3>
                <p>Dozens of rescued dogs live here while they heal. Each one is fed, treated, vaccinated and loved by our volunteers until the day they go home with a new family.</p>
              </div>
            </article>
          </div>
        </div>
      </section>
      <section className="block about-app">
        <div className="container">
          <div className="section-head">
            <p className="kicker">About PawTrack</p>
            <h2>One place for the shelter and its friends</h2>
            <p className="muted">PawTrack is the website and Android app of Ormoc Strays Oasis. It connects the shelter with adopters, donors and dog lovers, and helps our staff look after every dog.</p>
          </div>
          <div className="about-features">
            {PAWTRACK_FEATURES.map(([Icon, title, text]) => (
              <div className="about-feature" key={title}>
                <span className="about-feature-icon"><Icon size={20} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
          {showAppLinks ? (
            <div className="about-get">
              <div>
                <h3><Smartphone size={18} /> Take PawTrack with you</h3>
                <p className="muted">The free Android app has everything on this website. On iPhone, add PawTrack to your Home Screen from Safari.</p>
              </div>
              <div className="about-get-buttons"><GetAppButtons className="btn btn-primary" iphoneClassName="btn btn-light" size={17} both androidLabel="Download the Android app" /></div>
            </div>
          ) : null}
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
  const dirty = step !== 'sent' && !!(name.trim() || email.trim() || text.trim())
  const { leaveDialog } = useLeaveGuard(dirty, { what: 'this message' })

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
            <p><a className="link" href="tel:+639460297064">0946 029 7064</a></p>
            <p><a className="link" href="mailto:pawtrackoso@gmail.com">pawtrackoso@gmail.com</a></p>
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
      {leaveDialog}
    </PublicLayout>
  )
}
