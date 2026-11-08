import { useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { friendlyError } from '../lib/helpers.js'

// Shown after a teacher sign-up until a school admin approves the account.
// Until then the account has no teacher rights in the database either.
export default function TeacherPending() {
  const { profile, refreshProfile, cancelTeacherRequest, signOut } = useAuth()
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const running = useRef(false)

  async function run(name, action) {
    if (running.current) return
    running.current = true
    setBusy(name)
    setMessage('')
    try {
      const result = await action()
      if (name === 'check' && result && result.role !== 'teacher') {
        setMessage('Not approved yet. Please check again later.')
      }
    } catch (err) {
      setMessage(friendlyError(err))
    } finally {
      running.current = false
      setBusy('')
    }
  }

  return (
    <div className="boot">
      <div className="card auth-card teacher-pending">
        <p className="eyebrow">SkillLoop</p>
        <h1>Waiting for approval</h1>
        <p>
          Thanks, {profile?.displayName}. A school admin checks every teacher account
          before it can review explanations and read reports. This keeps students safe.
        </p>
        <p className="hint">
          Ask your school’s SkillLoop admin to approve you, then tap “Check again”.
        </p>
        {message && <p className="muted">{message}</p>}
        <div className="pending-actions">
          <button
            type="button"
            className="primary"
            disabled={Boolean(busy)}
            onClick={() => run('check', refreshProfile)}
          >
            {busy === 'check' ? 'Checking…' : 'Check again'}
          </button>
          <button
            type="button"
            className="react"
            disabled={Boolean(busy)}
            onClick={() => run('student', cancelTeacherRequest)}
          >
            {busy === 'student' ? 'Switching…' : 'I am a student'}
          </button>
          <button
            type="button"
            className="text-btn"
            disabled={Boolean(busy)}
            onClick={() => run('signout', signOut)}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
