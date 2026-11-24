import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { IconMenu } from './Icons'

export function PublicLayout({ children }: { children: ReactNode }) {
  const { profile, isStaff, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  return (
    <div>
      <header className="site-nav">
        <div className="container">
          <button className="oso-brand" type="button" onClick={() => navigate('/')}>
            <span>🐾</span>
            <span>
              <b>PawTrack - Ormoc Strays Oasis</b>
              <small>Rescue · Heal · Rehome</small>
            </span>
          </button>
          <button
            className="nav-toggle"
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <IconMenu />
          </button>
          <nav className={'site-links' + (open ? ' open' : '')}>
            <NavLink className={({ isActive }) => 'linkish' + (isActive ? ' on' : '')} to="/">Home</NavLink>
            <NavLink className={({ isActive }) => 'linkish' + (isActive ? ' on' : '')} to="/adopt">Adopt</NavLink>
            <NavLink className={({ isActive }) => 'linkish' + (isActive ? ' on' : '')} to="/donate">Donate</NavLink>
            <NavLink className={({ isActive }) => 'linkish' + (isActive ? ' on' : '')} to="/about">About</NavLink>
            <NavLink className={({ isActive }) => 'linkish' + (isActive ? ' on' : '')} to="/contact">Contact</NavLink>
            {profile ? (
              isStaff ? (
                <NavLink className="btn btn-accent btn-sm btn-pill" to="/ops">Staff desk</NavLink>
              ) : (
                <button className="btn btn-accent btn-sm btn-pill" type="button" onClick={() => signOut().then(() => navigate('/'))}>Log out</button>
              )
            ) : (
              <>
                <NavLink className="linkish" to="/login">Client Login</NavLink>
                <NavLink className="btn btn-accent btn-sm btn-pill" to="/staff-login">Staff Login</NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      {children}
      <footer className="site-footer">
        <div className="container">
          <div>
            <h4>About OSO</h4>
            <p>Ormoc Strays Oasis is a non-profit animal rescue based in Ormoc City, dedicated to saving, healing, and rehoming abandoned and abused animals.</p>
          </div>
          <div>
            <h4>Quick Links</h4>
            <p><button type="button" onClick={() => navigate('/adopt')}>Adopt a dog</button></p>
            <p><button type="button" onClick={() => navigate('/donate')}>Donate</button></p>
          </div>
          <div>
            <h4>Contact</h4>
            <p>0946 468 0043</p>
            <p>ormocstraysoasis@gmail.com</p>
            <p>Brgy. Cagbuhangin, Ormoc City</p>
          </div>
          <div>
            <h4>Working Hours</h4>
            <p>Open everyday · 9AM to 10PM</p>
          </div>
          <div className="foot-bottom">Ormoc Strays Oasis, Incorporated · PawTrack remake (React + TypeScript + Supabase)</div>
        </div>
      </footer>
    </div>
  )
}
