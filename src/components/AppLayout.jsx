import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import CompleteProfile from './CompleteProfile.jsx'
import ProfileMenu from './ProfileMenu.jsx'

const NAV = [
  { to: '/feed', label: 'Feed' },
  { to: '/profile', label: 'Profile' },
  { to: '/matches', label: 'Help' },
  { to: '/write', label: 'Write' },
]

export default function AppLayout() {
  const { profile, profileLoading, profileError, completeProfile, refreshProfile } =
    useAuth()
  const { toast, error, loadAll, helpRequests } = useAppData()
  // A chat belongs to the Help tab, and gets a phone layout without pinned bars.
  const onChat = useLocation().pathname.startsWith('/chat/')
  const pendingHelp =
    helpRequests?.filter(
      (item) => item.helperId === profile?.id && item.status === 'pending',
    ).length ?? 0

  async function handleCompleteProfile(payload) {
    await completeProfile(payload)
    await loadAll()
  }

  if (profileLoading && !profile) {
    return (
      <div className="boot">
        <p>Loading your profile…</p>
      </div>
    )
  }

  if (profileError && !profile) {
    return (
      <div className="boot">
        <div className="card auth-card">
          <p className="form-error">{profileError}</p>
          <p className="hint">
            If tables are missing, run <code>supabase/schema.sql</code> in the SQL
            Editor, then try again.
          </p>
          <button type="button" className="primary" onClick={refreshProfile}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  const needsProfile =
    !profile ||
    !profile.displayName ||
    (profile.role !== 'teacher' &&
      (!profile.grade || !profile.offers?.length || !profile.needs?.length))

  if (needsProfile) {
    return <CompleteProfile onSave={handleCompleteProfile} existing={profile} />
  }

  return (
    <div className={onChat ? 'shell on-chat' : 'shell'}>
      <header className="shell-header">
        <div className="shell-inner">
          <div className="brand">
            <p className="eyebrow">SkillLoop</p>
            <strong>Explain to earn trust</strong>
          </div>
          <nav className="tabs" aria-label="Main">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive || (item.to === '/matches' && onChat) ? 'tab on' : 'tab'
                }
              >
                {item.label}
                {item.to === '/matches' && pendingHelp > 0 ? ` (${pendingHelp})` : ''}
              </NavLink>
            ))}
          </nav>
          <ProfileMenu />
        </div>
      </header>
      <main className="app">
        {error && (
          <p className="banner">
            Could not load data. {error}{' '}
            <button type="button" className="text-btn inline" onClick={loadAll}>
              Retry
            </button>
            {/* Setup hint for developers only; students never see it. */}
            {import.meta.env.DEV && (
              <span>
                {' '}
                If tables are missing, run <code>supabase/schema.sql</code> in the
                SQL Editor (safe to re-run).
              </span>
            )}
          </p>
        )}
        <Outlet />
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
