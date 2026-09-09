import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { useDevice } from '../context/DeviceContext'
import { CommunityUiContext, type CommunityUi } from '../context/CommunityUiContext'
import { supabase } from '../lib/supabase'
import { DeviceBadge } from './DeviceBadge'
import { Avatar } from './Avatar'
import { CreatePost } from './CreatePost'
import {
  IconBell,
  IconChat,
  IconGear,
  IconHome,
  IconPaw,
  IconSearch,
  IconUser,
} from './Icons'

function SideItem({
  to,
  label,
  icon,
  badge,
  end,
}: {
  to: string
  label: string
  icon: ReactNode
  badge?: boolean
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => 'ig-item' + (isActive ? ' on' : '')}
      title={label}
    >
      {icon}
      <span>{label}</span>
      {badge ? <i className="note-dot" /> : null}
    </NavLink>
  )
}

export function CommunityLayout() {
  const { profile, loading } = useAuth()
  const { compact } = useDevice()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [bump, setBump] = useState(0)

  function refreshUnread() {
    if (!profile) return
    supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('to_user_id', profile.id).eq('read', false)
      .then(({ count }) => setUnread(count || 0))
  }

  useEffect(() => {
    refreshUnread()
  }, [profile?.id, location.pathname])

  if (loading) return <p className="empty" style={{ padding: 40 }}>Loading…</p>
  if (!profile) {
    return (
      <div className="auth-main">
        <div className="auth-card">
          <h1>Community login</h1>
          <p className="muted">Log in as a community member to see the feed, follow others, and share rescue stories.</p>
          <button className="btn btn-accent btn-pill" type="button" onClick={() => navigate('/login')}>Client login</button>
        </div>
      </div>
    )
  }
  if (profile.status !== 'active') {
    return (
      <div className="auth-main">
        <div className="auth-card">
          <h1>Account unavailable</h1>
          <p className="muted">This community account is not active. Contact Ormoc Strays Oasis if you need help.</p>
          <button className="btn btn-light btn-pill" type="button" onClick={() => navigate('/')}>Back to the site</button>
        </div>
      </div>
    )
  }

  const path = location.pathname
  const feedOn = path === '/community'
  const noteOn = path.startsWith('/community/notifications')
  const profileOn = path === '/community/profile' || path.startsWith('/community/u/')
  const settingsOn = path.startsWith('/community/settings')
  const ui: CommunityUi = {
    unread,
    refreshUnread,
    openCreate: () => setCreateOpen(true),
    bump,
  }

  return (
    <CommunityUiContext.Provider value={ui}>
      <div className="ig-shell">
        <DeviceBadge />
        {compact ? (
          <header className="topbar">
            <div className="brand-app">PawTrack</div>
            <button type="button" style={{ border: 0, background: 'none', padding: 0 }} onClick={() => navigate('/community/profile')}>
              <Avatar user={profile} />
            </button>
          </header>
        ) : (
          <aside className="ig-side">
            <button className="ig-logo" type="button" onClick={() => navigate('/community')} title="PawTrack">
              <IconPaw size={22} />
            </button>
            <nav className="ig-nav">
              <SideItem to="/community" end label="Home" icon={<IconHome size={22} />} />
              <SideItem to="/community/explore" label="Search" icon={<IconSearch size={22} />} />
              <SideItem to="/community/adopt" label="Adopt" icon={<IconPaw size={22} />} />
              <SideItem to="/community/messages" label="Messages" icon={<IconChat size={22} />} />
              <SideItem to="/community/notifications" label="Notifications" icon={<IconBell size={22} />} badge={unread > 0} />
              <button className="ig-item" type="button" title="Create" onClick={() => setCreateOpen(true)}>
                <span className="ig-plus">+</span>
                <span>Create</span>
              </button>
              <NavLink to="/community/profile" className={({ isActive }) => 'ig-item' + (isActive ? ' on' : '')} title="Profile">
                <Avatar user={profile} />
                <span>Profile</span>
              </NavLink>
            </nav>
            <NavLink to="/community/settings" className={({ isActive }) => 'ig-item ig-more' + (isActive ? ' on' : '')} title="More">
              <IconGear size={22} />
              <span>More</span>
            </NavLink>
          </aside>
        )}
        <main className={'ig-main' + (feedOn ? '' : ' padded')}>
          <Outlet />
        </main>
        {compact ? (
          <nav className="bottom-nav" aria-label="Community">
            <NavLink className={'nav-slot' + (feedOn ? ' on' : '')} to="/community" end aria-label="Home">
              <IconHome size={16} />
            </NavLink>
            <NavLink className={'nav-slot' + (noteOn ? ' on' : '')} to="/community/notifications" aria-label="Notifications">
              <IconBell size={16} />
              {unread ? <span className="nav-dot" /> : null}
            </NavLink>
            <button className={'nav-add' + (createOpen ? ' on' : '')} type="button" aria-label="New post" onClick={() => setCreateOpen(true)}>+</button>
            <NavLink className={'nav-slot' + (profileOn ? ' on' : '')} to="/community/profile" aria-label="Profile">
              <IconUser size={16} />
            </NavLink>
            <NavLink className={'nav-slot' + (settingsOn ? ' on' : '')} to="/community/settings" aria-label="Settings">
              <IconGear size={16} />
            </NavLink>
          </nav>
        ) : null}
        {path !== '/community/messages' ? (
          <NavLink className="chat-pill" to="/community/messages">
            <IconChat size={16} /> Messages
          </NavLink>
        ) : null}
        {createOpen ? (
          <CreatePost
            onClose={() => setCreateOpen(false)}
            onCreated={() => {
              setBump((n) => n + 1)
              if (path !== '/community') navigate('/community')
            }}
          />
        ) : null}
      </div>
    </CommunityUiContext.Provider>
  )
}
