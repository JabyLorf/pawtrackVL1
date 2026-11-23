import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { Download, LayoutDashboard, LogIn, LogOut, Mail, MapPin, Menu, PawPrint, Phone, Clock } from 'lucide-react'
import { APK_URL, isNativeApp } from '../lib/app'

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
            <span className="logo-mark"><PawPrint size={20} /></span>
            <span>
              <b>PawTrack</b>
              <small>Ormoc Strays Oasis</small>
            </span>
          </button>
          <button
            className="nav-toggle"
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Menu size={20} />
          </button>
          <nav className={'site-links' + (open ? ' open' : '')}>
            <NavLink className={({ isActive }) => 'linkish' + (isActive ? ' on' : '')} to="/">Home</NavLink>
            <NavLink className={({ isActive }) => 'linkish' + (isActive ? ' on' : '')} to="/adopt">Adopt</NavLink>
            <NavLink className={({ isActive }) => 'linkish' + (isActive ? ' on' : '')} to="/donate">Donate</NavLink>
            <NavLink className={({ isActive }) => 'linkish' + (isActive ? ' on' : '')} to="/about">About</NavLink>
            <NavLink className={({ isActive }) => 'linkish' + (isActive ? ' on' : '')} to="/contact">Contact</NavLink>
            {isStaff ? (
              <NavLink className="btn btn-primary btn-sm" to="/ops"><LayoutDashboard size={16} /> Staff desk</NavLink>
            ) : profile ? (
              <button className="btn btn-light btn-sm" type="button" onClick={() => signOut().then(() => navigate('/'))}><LogOut size={16} /> Sign out</button>
            ) : (
              <NavLink className="btn btn-primary btn-sm" to="/staff-login"><LogIn size={16} /> Staff sign in</NavLink>
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
            {!isNativeApp ? <p><a href={APK_URL} download><Download size={14} /> Get the Android app</a></p> : null}
          </div>
          <div>
            <h4>Contact</h4>
            <p className="foot-line"><Phone size={14} /> 0946 468 0043</p>
            <p className="foot-line"><Mail size={14} /> ormocstraysoasis@gmail.com</p>
            <p className="foot-line"><MapPin size={14} /> Brgy. Cagbuhangin, Ormoc City</p>
          </div>
          <div>
            <h4>Working Hours</h4>
            <p className="foot-line"><Clock size={14} /> Open every day · 9 AM to 10 PM</p>
          </div>
          <div className="foot-bottom">© {new Date().getFullYear()} Ormoc Strays Oasis, Incorporated</div>
        </div>
      </footer>
    </div>
  )
}
