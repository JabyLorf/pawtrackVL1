import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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
