import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useDevice } from '../context/DeviceContext'
import { supabase } from '../lib/supabase'
import { DeviceBadge } from './DeviceBadge'
import { IconBell, IconChart, IconMenu, IconPaw, IconUser } from './Icons'

export function OpsLayout() {
  const { profile, isStaff, isAdmin, loading, signOut } = useAuth()
  const { compact } = useDevice()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const [pending, setPending] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!isStaff) return
    supabase.from('inbox_messages').select('id', { count: 'exact', head: true }).eq('read', false).then(({ count }) => setUnread(count || 0))
    supabase.from('adoptions').select('id', { count: 'exact', head: true }).eq('status', 'pending').then(({ count }) => setPending(count || 0))
  }, [isStaff])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!compact) setMenuOpen(false)
  }, [compact])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  if (loading) return <p className="empty" style={{ padding: 40 }}>Loading…</p>
  if (!isStaff) {
    return (
      <div className="auth-main">
        <div className="auth-card">
          <h1>Staff only</h1>
          <p className="muted">Sign in with a staff or admin account.</p>
          <button className="btn btn-accent btn-pill" type="button" onClick={() => navigate('/staff-login')}>Staff login</button>
        </div>
      </div>
    )
  }

  const Item = ({ to, label, badge }: { to: string; label: string; badge?: number }) => (
    <NavLink to={to} className={({ isActive }) => 'ops-item' + (isActive ? ' on' : '')} end={to === '/ops'}>
      {label}
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </NavLink>
  )

  const dogsOn = location.pathname.startsWith('/ops/dogs')
  const adoptOn = location.pathname.startsWith('/ops/adoptions')
  const inboxOn = location.pathname.startsWith('/ops/inbox')
  const dashOn = location.pathname === '/ops'

  return (
    <div className="ops-shell">
      <DeviceBadge />
      {compact ? (
        <header className="ops-topbar">
          <button className="nav-toggle" type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <IconMenu />
          </button>
          <div className="brand-app">PawTrack</div>
          <span className="ops-avatar">{(profile?.display_name || 'S').slice(0, 1)}</span>
        </header>
      ) : null}
      {compact && menuOpen ? <button className="ops-backdrop" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} /> : null}
      <aside className={'ops-side' + (compact && menuOpen ? ' open' : '')}>
        <div className="ops-brand">
          PawTrack
          <small>Ormoc Strays Oasis</small>
        </div>
        {compact ? (
          <button className="chat-x ops-close" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>×</button>
        ) : null}
        <div className="ops-group">Shelter operations</div>
        <Item to="/ops" label="Dashboard" />
        <Item to="/ops/dogs" label="Pet Register" />
        <Item to="/ops/adopted" label="Adopted" />
        <Item to="/ops/mortality" label="Mortality" />
        <Item to="/ops/adoptions" label="Adoptions" badge={pending} />
        <Item to="/ops/donations" label="Donations" />
        <Item to="/ops/inbox" label="Inbox" badge={unread} />
        {isAdmin ? (
          <>
            <div className="ops-group">Administration</div>
            <Item to="/ops/staff" label="Staff & Volunteers" />
          </>
        ) : null}
        <div className="ops-foot">
          <button className="btn btn-light" type="button" onClick={() => navigate('/')}>View public website</button>
          <button className="btn btn-ghost" type="button" onClick={() => navigate('/community')}>Open community</button>
          <button className="btn btn-ghost" type="button" onClick={() => signOut().then(() => navigate('/'))}>Sign out</button>
        </div>
      </aside>
      <div className="ops-main">
        <header className="ops-head">
          <div>
            <div className="when muted">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
          <div>
            <b>{profile?.display_name}</b>
            <div className="muted">{isAdmin ? 'Administrator' : 'Staff'}</div>
          </div>
        </header>
        <Outlet />
      </div>
      {compact ? (
        <nav className="bottom-nav" aria-label="Staff">
          <NavLink className={'nav-slot' + (dashOn ? ' on' : '')} to="/ops" end aria-label="Dashboard">
            <IconChart size={16} />
          </NavLink>
          <NavLink className={'nav-slot' + (dogsOn ? ' on' : '')} to="/ops/dogs" aria-label="Pet register">
            <IconPaw size={16} />
          </NavLink>
          <NavLink className={'nav-add' + (adoptOn ? ' on' : '')} to="/ops/adoptions" aria-label="Adoptions">+</NavLink>
          <NavLink className={'nav-slot' + (inboxOn ? ' on' : '')} to="/ops/inbox" aria-label="Inbox">
            <IconBell size={16} />
            {unread ? <span className="nav-dot" /> : null}
          </NavLink>
          <button className={'nav-slot' + (menuOpen ? ' on' : '')} type="button" aria-label="More" onClick={() => setMenuOpen(true)}>
            <IconUser size={16} />
          </button>
        </nav>
      ) : null}
    </div>
  )
}
