import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { friendlyError } from '../lib/helpers.js'

const ACCOUNT_TYPES = [
  ['student', 'Student'],
  ['teacher', 'Teacher'],
]

export default function LoginPage() {
  const { session, loading, signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [accountType, setAccountType] = useState('student')
  const isTeacher = mode === 'signup' && accountType === 'teacher'
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  if (loading) {
    return (
      <div className="boot">
        <p>Restoring your session…</p>
      </div>
    )
  }

  if (session) {
    return <Navigate to="/feed" replace />
  }

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password)
      } else {
        if (!displayName.trim()) {
          throw new Error('Add a display name.')
        }
        await signUp({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
          accountType,
        })
      }
    } catch (err) {
      setMessage(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="card form auth-card" onSubmit={submit}>
        <p className="eyebrow">SkillLoop</p>
        <h1>{mode === 'signin' ? 'Sign in' : 'Create an account'}</h1>
        {!isTeacher && (
          <p className="hint">
            Reputation comes from other students voting your explanations as
            helpful — not a score you type in.
          </p>
        )}
        {mode === 'signup' && (
          <div className="seg account-type" role="radiogroup" aria-label="I am a">
            {ACCOUNT_TYPES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={accountType === value}
                className={accountType === value ? 'seg-btn on' : 'seg-btn'}
                onClick={() => setAccountType(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {mode === 'signup' && (
          <label>
            {isTeacher ? 'Your name (students will see it)' : 'Display name'}
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={isTeacher ? 'Ms Aigerim' : 'Aigerim'}
              autoComplete="nickname"
              required
              maxLength={80}
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
        </label>
        {mode === 'signup' && (
          <p className="hint tight">
            {isTeacher
              ? 'A school admin checks every teacher account. You can sign in straight away, and teacher tools open once you are approved.'
              : 'Next you’ll pick your grade and subjects.'}
          </p>
        )}
        {message && <p className="form-error">{message}</p>}
        <button type="submit" className="primary" disabled={busy}>
          {busy
            ? 'Please wait…'
            : mode === 'signin'
              ? 'Sign in'
              : isTeacher
                ? 'Sign up as a teacher'
                : 'Sign up as a student'}
        </button>
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            setMessage('')
            setMode((current) => (current === 'signin' ? 'signup' : 'signin'))
          }}
        >
          {mode === 'signin'
            ? 'Need an account? Sign up'
            : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
