import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { Bell, Clock, HandHeart, MessageCircle, Newspaper, Users, Home, Info, LayoutDashboard, LogIn, LogOut, Mail, MapPin, Menu, PawPrint, Phone, X } from 'lucide-react'
import { showAppLinks } from '../lib/app'
import { GetAppButtons } from './IosInstall'
import { useSignOut } from './useSignOut'
import { Avatar } from './Avatar'
import { useUnread } from './useUnread'

/** noFooter: app-like pages (Community feed, messages…) skip the site footer. */
export function PublicLayout({ children, noFooter }: { children: ReactNode; noFooter?: boolean }) {
  const { profile, isStaff } = useAuth()
  const { askSignOut, signOutDialog } = useSignOut()
  const unread = useUnread()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const links: Array<[string, string, ReactNode]> = [
    ['/', 'Home', <Home size={18} />],
    ['/adopt', 'Adopt', <PawPrint size={18} />],
    ['/community', 'Community', <Users size={18} />],
    ['/donate', 'Donate', <HandHeart size={18} />],
    ['/about', 'About', <Info size={18} />],
    ['/contact', 'Contact', <Mail size={18} />],
  ]

  // Members reach their profile from the picture in the icon bar.
  const account = isStaff ? (
    <NavLink className="btn btn-primary btn-sm" to="/ops"><LayoutDashboard size={16} /> Staff desk</NavLink>
  ) : profile && profile.status === 'active' ? null : profile ? (
    <button className="btn btn-light btn-sm" type="button" onClick={askSignOut}><LogOut size={16} /> Sign out</button>
  ) : (
    <NavLink className="btn btn-primary btn-sm" to="/staff-login"><LogIn size={16} /> Staff sign in</NavLink>
  )

  const badge = (n: number) => (n ? <span className="hdr-badge">{n > 99 ? '99+' : n}</span> : null)
  const alerts = profile && profile.status === 'active' ? (
    <>
      <NavLink className={({ isActive }) => 'nav-icon feed-icon' + (isActive ? ' on' : '')} to="/community" end aria-label="Community feed" title="Feed">
        <Newspaper size={20} />
      </NavLink>
      <NavLink className={({ isActive }) => 'nav-icon' + (isActive ? ' on' : '')} to="/community/notifications" aria-label={`Notifications${unread.notifications ? `, ${unread.notifications} new` : ''}`}>
        <Bell size={20} />{badge(unread.notifications)}
      </NavLink>
      <NavLink className={({ isActive }) => 'nav-icon' + (isActive ? ' on' : '')} to="/messages" aria-label={`Messages${unread.chats ? `, ${unread.chats} unread` : ''}`}>
        <MessageCircle size={20} />{badge(unread.chats)}
      </NavLink>
      <NavLink className={({ isActive }) => 'nav-icon nav-me' + (isActive ? ' on' : '')} to={`/community/u/${profile.username}`} aria-label="My profile" title="My profile">
        <Avatar src={profile.avatar_url} name={profile.display_name} size={28} />
      </NavLink>
    </>
  ) : null

  return (
    <div className="site-shell">
      <header className="site-nav">
        <div className="container">
          <button className="oso-brand" type="button" onClick={() => navigate('/')}>
            <span className="logo-mark"><PawPrint size={20} /></span>
            <span>
              <b>PawTrack</b>
              <small>Ormoc Strays Oasis</small>
            </span>
          </button>
          {alerts ? <div className="nav-alerts phone-only">{alerts}</div> : null}
          <button
            className="nav-toggle"
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="site-drawer"
            onClick={() => setOpen(true)}
          >
            <Menu size={20} />
          </button>
          <nav className="site-links" aria-label="Main">
            {links.map(([to, label]) => (
              <NavLink key={to} className={({ isActive }) => 'linkish' + (isActive ? ' on' : '')} to={to} end>{label}</NavLink>
            ))}
            {alerts ? <span className="nav-alerts">{alerts}</span> : null}
            {account}
          </nav>
        </div>
      </header>
      <div className={'drawer-backdrop' + (open ? ' open' : '')} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside id="site-drawer" className={'site-drawer' + (open ? ' open' : '')} aria-label="Menu" aria-hidden={!open} inert={!open}>
        <div className="drawer-head">
          <span className="oso-brand">
            <span className="logo-mark"><PawPrint size={20} /></span>
            <span>
              <b>PawTrack</b>
              <small>Ormoc Strays Oasis</small>
            </span>
          </span>
          <button className="icon-btn" type="button" aria-label="Close menu" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <nav className="drawer-links">
          {links.map(([to, label, icon]) => (
            <NavLink key={to} className={({ isActive }) => 'drawer-link' + (isActive ? ' on' : '')} to={to} end>
              {icon}<span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="drawer-foot">
          {account}
          {profile && profile.status === 'active' ? (
            <button className="btn btn-light btn-sm" type="button" onClick={() => { setOpen(false); askSignOut() }}><LogOut size={16} /> Sign out</button>
          ) : null}
          {showAppLinks ? <GetAppButtons className="btn btn-light btn-sm" both /> : null}
        </div>
      </aside>
      {children}
      {noFooter ? null : <footer className="site-footer">
        <div className="container">
          <div>
            <h4>About OSO</h4>
            <p>Ormoc Strays Oasis is a non-profit animal rescue based in Ormoc City, dedicated to saving, healing, and rehoming abandoned and abused animals.</p>
          </div>
          <div>
            <h4>Quick Links</h4>
            <p><button type="button" onClick={() => navigate('/adopt')}>Adopt a dog</button></p>
            <p><button type="button" onClick={() => navigate('/donate')}>Donate</button></p>
            {showAppLinks ? <div className="foot-app"><GetAppButtons className="" size={14} both /></div> : null}
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
      </footer>}
      {signOutDialog}
    </div>
  )
}
