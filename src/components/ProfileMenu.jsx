import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { initials, roleLabel } from '../lib/helpers.js'

export default function ProfileMenu() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const navigate = useNavigate()
  const label = profile?.displayName || 'You'

  useEffect(() => {
    function onDocClick(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  async function handleSignOut() {
    setOpen(false)
    await signOut()
    navigate('/login')
  }

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="you you-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label}, ${roleLabel(profile)}, account menu`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(label)}
        </span>
        {/* Spans, not div/p: only inline content is valid inside a button. */}
        <span className="you-copy">
          <strong>{label}</strong>
          <span className="you-role">{roleLabel(profile)}</span>
        </span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              navigate('/profile')
            }}
          >
            View profile
          </button>
          <button type="button" role="menuitem" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
