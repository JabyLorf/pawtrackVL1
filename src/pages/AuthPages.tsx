import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  AtSign,
  Check,
  Circle,
  Clock,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MailCheck,
  PawPrint,
  ShieldCheck,
  User,
  UserPlus,
  Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { PASSWORD_RULES, passwordOk } from '../lib/utils'

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <aside className="auth-side">
        <Link className="auth-logo" to="/">
          <span className="logo-mark"><PawPrint size={20} /></span>
          PawTrack
        </Link>
        <div className="auth-side-body">
          <h2>Shelter operations for Ormoc Strays Oasis</h2>
          <p>One place for the team to track every dog, adoption and donation.</p>
          <ul className="auth-points">
            <li><ShieldCheck size={18} /> Staff accounts are approved by an administrator</li>
            <li><Users size={18} /> Shared dog register, adoptions and inbox</li>
            <li><MailCheck size={18} /> Email verification on every new account</li>
          </ul>
        </div>
        <small>Ormoc Strays Oasis, Incorporated</small>
      </aside>
      <main className="auth-main">
        <Link className="auth-back" to="/"><ArrowLeft size={16} /> Back to the website</Link>
        <div className="auth-card">{children}</div>
      </main>
    </div>
  )
}

function Field({
  label,
  icon,
  children,
}: {
  label: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-box">
        {icon}
        {children}
      </div>
    </label>
  )
}

function PasswordInput({
  value,
  onChange,
  autoComplete,
}: {
  value: string
  onChange: (v: string) => void
  autoComplete: string
}) {
  const [show, setShow] = useState(false)
  return (
    <>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
      />
      <button className="field-btn" type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </>
  )
}

function CodeStep({
  email,
  onVerified,
  onBack,
}: {
  email: string
  onVerified: () => void
  onBack: () => void
}) {
  const { verifySignupOtp, resendSignupOtp } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState(`We sent a verification code to ${email}.`)
  const [busy, setBusy] = useState(false)

  async function verify(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (code.length < 6) { setError('Enter the code from the email.'); return }
    setBusy(true)
    const err = await verifySignupOtp(email, code)
    setBusy(false)
    if (err) { setError(err); return }
    onVerified()
  }

  async function resend() {
    setError('')
    const err = await resendSignupOtp(email)
    if (err) { setError(err); return }
    setOk('A new code is on its way.')
    setCode('')
  }

  return (
    <form onSubmit={verify}>
      <div className="auth-icon"><MailCheck size={22} /></div>
      <h1>Verify your email</h1>
      {ok ? <p className="auth-sub">{ok}</p> : null}
      <input
        className="code-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="••••••"
        maxLength={10}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        aria-label="Verification code"
        autoFocus
      />
      {error ? <p className="err">{error}</p> : null}
      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
        {busy ? 'Verifying…' : 'Verify email'}
      </button>
      <div className="auth-foot">
        <button className="link" type="button" onClick={resend}>Resend code</button>
        <button className="link" type="button" onClick={onBack}>Use a different email</button>
      </div>
    </form>
  )
}

function PendingNotice({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="auth-icon warn"><Clock size={22} /></div>
      <h1>{title}</h1>
      <p className="auth-sub">{body}</p>
      <Link className="btn btn-light btn-block" to="/">Back to the website</Link>
    </div>
  )
}

export function StaffLoginPage() {
  const { signIn, signOut } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<'login' | 'verify' | 'pending'>('login')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const err = await signIn(email.trim(), password)
    if (err) {
      setBusy(false)
      if (/not confirmed/i.test(err)) { setStep('verify'); return }
      setError(err === 'Invalid login credentials' ? 'Wrong email or password.' : err)
      return
    }
    const { data } = await supabase.auth.getUser()
    const { data: p } = await supabase.from('profiles').select('status').eq('id', data.user?.id || '').maybeSingle()
    setBusy(false)
    if (p?.status === 'active') { navigate('/ops'); return }
    await signOut()
    if (p?.status === 'pending') { setStep('pending'); return }
    setError('This account has been declined or disabled. Contact an administrator.')
  }

  return (
    <AuthShell>
      {step === 'verify' ? (
        <CodeStep email={email.trim()} onVerified={() => { signOut(); setStep('pending') }} onBack={() => setStep('login')} />
      ) : step === 'pending' ? (
        <PendingNotice
          title="Waiting for approval"
          body="Your email is verified. An administrator still needs to approve your account before you can sign in. Please check back later."
        />
      ) : (
        <form onSubmit={submit}>
          <h1>Staff sign in</h1>
          <p className="auth-sub">Sign in to the PawTrack staff desk.</p>
          <Field label="Email" icon={<Mail size={17} />}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          <Field label="Password" icon={<Lock size={17} />}>
            <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
          </Field>
          {error ? <p className="err">{error}</p> : null}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="auth-divider"><span>New to the team?</span></div>
          <Link className="btn btn-light btn-block" to="/staff-apply"><UserPlus size={17} /> Apply as staff</Link>
        </form>
      )}
    </AuthShell>
  )
}

export function StaffApplyPage() {
  const { signUp, signOut } = useAuth()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<'form' | 'verify' | 'done'>('form')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const user = username.trim()
    if (!name.trim()) { setError('Enter your full name.'); return }
    if (!/^[A-Za-z0-9._]{3,30}$/.test(user)) { setError('Username must be 3–30 letters, numbers, dots or underscores.'); return }
    if (!passwordOk(password)) { setError('Your password does not meet all the requirements.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true)
    const { data: free, error: rpcErr } = await supabase.rpc('username_available', { p_username: user })
    if (rpcErr) { setBusy(false); setError(rpcErr.message); return }
    if (!free) { setBusy(false); setError('That username is already taken.'); return }
    const err = await signUp(email.trim(), password, user, name.trim())
    setBusy(false)
    if (err) { setError(err); return }
    setStep('verify')
  }

  const matches = confirm.length > 0 && confirm === password

  return (
    <AuthShell>
      {step === 'verify' ? (
        <CodeStep email={email.trim()} onVerified={() => { signOut(); setStep('done') }} onBack={() => setStep('form')} />
      ) : step === 'done' ? (
        <PendingNotice
          title="Application submitted"
          body="Thanks! Your email is verified and your application has been sent to the administrators. You can sign in once an administrator approves your account."
        />
      ) : (
        <form onSubmit={submit}>
          <h1>Apply as staff</h1>
          <p className="auth-sub">Create your account. An administrator reviews every application before it can sign in.</p>
          <Field label="Full name" icon={<User size={17} />}>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </Field>
          <Field label="Username" icon={<AtSign size={17} />}>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </Field>
          <Field label="Email" icon={<Mail size={17} />}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          <Field label="Password" icon={<Lock size={17} />}>
            <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
          </Field>
          <ul className="pw-rules" aria-label="Password requirements">
            {PASSWORD_RULES.map(([label, test]) => {
              const met = test(password)
              return (
                <li key={label} className={met ? 'met' : undefined}>
                  {met ? <Check size={14} /> : <Circle size={14} />} {label}
                </li>
              )
            })}
          </ul>
          <Field label="Confirm password" icon={<Lock size={17} />}>
            <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </Field>
          {confirm ? (
            <p className={matches ? 'hint ok' : 'hint'}>{matches ? 'Passwords match.' : 'Passwords do not match yet.'}</p>
          ) : null}
          {error ? <p className="err">{error}</p> : null}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? 'Sending code…' : 'Continue'}
          </button>
          <p className="auth-foot center">Already approved? <Link to="/staff-login">Sign in</Link></p>
        </form>
      )}
    </AuthShell>
  )
}
