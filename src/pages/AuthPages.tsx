import { useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { passwordErrors } from '../lib/utils'

function AuthShell({ title, side, children }: { title: string; side: string; children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <aside className="auth-side">
        <p className="kicker" style={{ color: '#fde68a' }}>PawTrack</p>
        <h2>{title}</h2>
        <p>{side}</p>
        <Link className="btn btn-light btn-pill" to="/">← Back to the site</Link>
      </aside>
      <main className="auth-main">{children}</main>
    </div>
  )
}

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const err = await signIn(email, password)
    if (err) { setError(err); return }
    const { data } = await supabase.auth.getUser()
    const id = data.user?.id
    if (!id) { navigate('/community'); return }
    const { data: p } = await supabase.from('profiles').select('role,status').eq('id', id).maybeSingle()
    if (p && (p.role === 'staff' || p.role === 'admin') && p.status === 'active') navigate('/ops')
    else navigate('/community')
  }

  return (
    <AuthShell title="Welcome back" side="Log in as a community member to support Ormoc Strays Oasis.">
      <form className="auth-card" onSubmit={submit}>
        <h1>Client login</h1>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error ? <p className="err">{error}</p> : null}
        <button className="btn btn-accent btn-block btn-pill" type="submit">Log In</button>
        <p className="muted" style={{ marginTop: 12 }}>New here? <Link to="/signup">Create an account</Link></p>
        <p className="muted"><Link to="/staff-login">Staff / Admin login →</Link></p>
      </form>
    </AuthShell>
  )
}

export function SignupPage() {
  const { signUp, verifySignupOtp, resendSignupOtp } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const boxes = useRef<Array<HTMLInputElement | null>>([])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const user = username.trim()
    const display = name.trim()
    if (!display) { setError('Enter your name.'); return }
    if (!user) { setError('Enter a username.'); return }
    const issues = passwordErrors(password)
    if (issues.length) { setError('Password needs ' + issues.join(', ') + '.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    const { data: taken } = await supabase.from('profiles').select('id').ilike('username', user).maybeSingle()
    if (taken) { setError('That username is taken.'); return }
    const err = await signUp(email.trim(), password, user, display)
    if (err) { setError(err); return }
    setStep('otp')
    setOk('We sent a 6-digit code to ' + email.trim() + '.')
  }

  function setDigit(i: number, value: string) {
    const d = value.replace(/\D/g, '').slice(-1)
    setOtp((cur) => {
      const next = cur.slice()
      next[i] = d
      return next
    })
    if (d && i < 5) boxes.current[i + 1]?.focus()
  }

  function onKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) boxes.current[i - 1]?.focus()
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('')
    if (!digits.length) return
    setOtp((cur) => cur.map((_, i) => digits[i] || ''))
    boxes.current[Math.min(digits.length, 5)]?.focus()
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setError('')
    const token = otp.join('')
    if (token.length !== 6) { setError('Enter the 6-digit code.'); return }
    const err = await verifySignupOtp(email.trim(), token)
    if (err) { setError(err); return }
    navigate('/community')
  }

  async function resend() {
    setError('')
    const err = await resendSignupOtp(email.trim())
    if (err) { setError(err); return }
    setOk('Code resent.')
    setOtp(['', '', '', '', '', ''])
    boxes.current[0]?.focus()
  }

  return (
    <AuthShell title="Create your account" side="Join the PawTrack community. New members start as clients and verify with a 6-digit email code.">
      {step === 'form' ? (
        <form className="auth-card" onSubmit={submit}>
          <h1>Sign up</h1>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          <p className="muted" style={{ fontSize: '.82rem' }}>8+ characters, upper, lower, number, and special character.</p>
          <label>Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          {error ? <p className="err">{error}</p> : null}
          <button className="btn btn-accent btn-block btn-pill" type="submit">Send code</button>
          <p className="muted" style={{ marginTop: 12 }}>Already have an account? <Link to="/login">Log in</Link></p>
        </form>
      ) : (
        <form className="auth-card" onSubmit={verify}>
          <h1>Verify email</h1>
          <p className="muted">Enter the 6-digit code we emailed you.</p>
          <div className="otp-row">
            {otp.map((d, i) => (
              <input
                key={i}
                ref={(el) => { boxes.current[i] = el }}
                className="otp-box"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKey(i, e)}
                onPaste={onPaste}
                aria-label={`Digit ${i + 1}`}
              />
            ))}
          </div>
          {error ? <p className="err">{error}</p> : null}
          {ok ? <p className="ok">{ok}</p> : null}
          <button className="btn btn-accent btn-block btn-pill" type="submit">Verify & continue</button>
          <p className="muted" style={{ marginTop: 12 }}>
            <button className="link" type="button" onClick={resend}>Resend code</button>
            {' · '}
            <button className="link" type="button" onClick={() => { setStep('form'); setError(''); setOk('') }}>Back</button>
          </p>
        </form>
      )}
    </AuthShell>
  )
}

export function StaffLoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const err = await signIn(email, password)
    if (err) { setError(err); return }
    navigate('/ops')
  }

  return (
    <AuthShell title="Staff & Admin" side="No public sign-up. Shelter staff and admins manage the pound from this desk.">
      <form className="auth-card" onSubmit={submit}>
        <h1>Staff / Admin login</h1>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error ? <p className="err">{error}</p> : null}
        <button className="btn btn-accent btn-block btn-pill" type="submit">Log In</button>
        <p className="muted" style={{ marginTop: 12 }}>Create the user in Supabase Auth, then run supabase/promote-staff.sql.</p>
      </form>
    </AuthShell>
  )
}
