import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import {
  ClipboardList,
  Globe,
  HandCoins,
  HeartHandshake,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  PawPrint,
  Plus,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useDevice } from '../context/DeviceContext'
import { supabase } from '../lib/supabase'
import { useSignOut } from './useSignOut'

export function OpsLayout() {
  const { profile, isStaff, isAdmin, loading } = useAuth()
  const { askSignOut, signOutDialog } = useSignOut()
  const { compact } = useDevice()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const [pending, setPending] = useState(0)
  const [applications, setApplications] = useState(0)
  const [donationsPending, setDonationsPending] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!isStaff) return
    supabase.from('inbox_messages').select('id', { count: 'exact', head: true }).eq('read', false).then(({ count }) => setUnread(count || 0))
    supabase.from('adoptions').select('id', { count: 'exact', head: true }).eq('status', 'pending').then(({ count }) => setPending(count || 0))
    supabase.from('donations').select('id', { count: 'exact', head: true }).eq('status', 'pending').then(({ count }) => setDonationsPending(count || 0))
  }, [isStaff, location.pathname])

  useEffect(() => {
    if (!isAdmin) return
    supabase.rpc('staff_applications').then(({ data }) => setApplications(((data as unknown[]) || []).length))
  }, [isAdmin, location.pathname])

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
    const waiting = profile?.status === 'pending'
    return (
      <div className="auth-main solo">
        <div className="auth-card">
          <div className={'auth-icon' + (waiting ? ' warn' : '')}><ShieldCheck size={22} /></div>
          <h1>{waiting ? 'Waiting for approval' : 'Staff only'}</h1>
          <p className="auth-sub">
            {waiting
              ? 'An administrator still needs to approve your account.'
              : 'Sign in with an approved staff or administrator account.'}
          </p>
          {profile ? (
            <button className="btn btn-light btn-block" type="button" onClick={askSignOut}>Sign out</button>
          ) : (
            <button className="btn btn-primary btn-block" type="button" onClick={() => navigate('/staff-login')}>Go to staff sign in</button>
          )}
        </div>
        {signOutDialog}
      </div>
    )
  }

  const Item = ({ to, label, icon, badge }: { to: string; label: string; icon: ReactNode; badge?: number }) => (
    <NavLink to={to} className={({ isActive }) => 'ops-item' + (isActive ? ' on' : '')} end={to === '/ops'}>
      {icon}
      <span>{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </NavLink>
  )

  const initial = (profile?.display_name || 'S').slice(0, 1).toUpperCase()
  const path = location.pathname

  return (
    <div className="ops-shell">
      {compact ? (
        <header className="ops-topbar">
          <button className="icon-btn" type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="brand-app"><PawPrint size={18} /> PawTrack</div>
          <span className="ops-avatar">{initial}</span>
        </header>
      ) : null}
      {compact && menuOpen ? <button className="ops-backdrop" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} /> : null}
      <aside className={'ops-side' + (compact && menuOpen ? ' open' : '')}>
        <div className="ops-brand">
          <span className="logo-mark"><PawPrint size={18} /></span>
          <div>
            PawTrack
            <small>Ormoc Strays Oasis</small>
          </div>
        </div>
        {compact ? (
          <button className="icon-btn ops-close" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X size={20} /></button>
        ) : null}
        <div className="ops-group">Shelter operations</div>
        <Item to="/ops" label="Dashboard" icon={<LayoutDashboard size={18} />} />
        <Item to="/ops/dogs" label="Pet Register" icon={<PawPrint size={18} />} />
        <Item to="/ops/intake" label="Intake" icon={<Syringe size={18} />} />
        <Item to="/ops/adopted" label="Adopted" icon={<HeartHandshake size={18} />} />
        <Item to="/ops/mortality" label="Mortality" icon={<Stethoscope size={18} />} />
        <Item to="/ops/adoptions" label="Adoptions" icon={<ClipboardList size={18} />} badge={pending} />
        <Item to="/ops/donations" label="Donations" icon={<HandCoins size={18} />} badge={donationsPending} />
        <Item to="/ops/inbox" label="Inbox" icon={<Inbox size={18} />} badge={unread} />
        {isAdmin ? (
          <>
            <div className="ops-group">Administration</div>
            <Item to="/ops/staff" label="Staff & Volunteers" icon={<Users size={18} />} badge={applications} />
            <Item to="/ops/deleted" label="Recently deleted" icon={<Trash2 size={18} />} />
          </>
        ) : null}
        <div className="ops-foot">
          <div className="ops-me">
            <span className="ops-avatar">{initial}</span>
            <div>
              <b>{profile?.display_name}</b>
              <small>{isAdmin ? 'Administrator' : 'Staff'}</small>
            </div>
          </div>
          <button className="ops-item" type="button" onClick={() => navigate('/')}><Globe size={18} /><span>Public website</span></button>
          <button className="ops-item" type="button" onClick={askSignOut}><LogOut size={18} /><span>Sign out</span></button>
        </div>
      </aside>
      <div className="ops-main">
        {!compact ? (
          <header className="ops-head">
            <div className="muted">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </header>
        ) : null}
        <Outlet />
      </div>
      {compact ? (
        <nav className="bottom-nav" aria-label="Staff">
          <NavLink className={'nav-slot' + (path === '/ops' ? ' on' : '')} to="/ops" end>
            <LayoutDashboard size={20} /><span>Home</span>
          </NavLink>
          <NavLink className={'nav-slot' + (path.startsWith('/ops/dogs') && path !== '/ops/dogs/new' ? ' on' : '')} to="/ops/dogs">
            <PawPrint size={20} /><span>Dogs</span>
          </NavLink>
          <NavLink className={'nav-add' + (path === '/ops/dogs/new' ? ' on' : '')} to="/ops/dogs/new" aria-label="Add a dog">
            <Plus size={24} />
          </NavLink>
          <NavLink className={'nav-slot' + (path.startsWith('/ops/adoptions') ? ' on' : '')} to="/ops/adoptions">
            <ClipboardList size={20} /><span>Adoptions</span>
            {pending ? <span className="nav-dot" /> : null}
          </NavLink>
          <NavLink className={'nav-slot' + (path.startsWith('/ops/inbox') ? ' on' : '')} to="/ops/inbox">
            <Inbox size={20} /><span>Inbox</span>
            {unread ? <span className="nav-dot" /> : null}
          </NavLink>
        </nav>
      ) : null}
      {signOutDialog}
    </div>
  )
}
