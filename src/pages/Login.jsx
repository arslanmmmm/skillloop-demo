import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { GRADES, SUBJECTS } from '../config/subjects.js'
import { useAuth } from '../hooks/useAuth.js'

export default function LoginPage() {
  const { session, loading, signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [grade, setGrade] = useState(10)
  const [offers, setOffers] = useState(['Math'])
  const [needs, setNeeds] = useState(['History'])
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

  function toggle(list, setList, subject) {
    setList((current) =>
      current.includes(subject)
        ? current.filter((item) => item !== subject)
        : [...current, subject],
    )
  }

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password)
      } else {
        if (!displayName.trim() || !grade || offers.length === 0 || needs.length === 0) {
          throw new Error('Name, grade, one subject you can teach, and one you need are required.')
        }
        await signUp({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
          grade: Number(grade),
          offers,
          needs,
        })
      }
    } catch (err) {
      setMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="card form auth-card" onSubmit={submit}>
        <p className="eyebrow">SkillLoop</p>
        <h1>{mode === 'signin' ? 'Sign in' : 'Create an account'}</h1>
        <p className="hint">
          Reputation comes from other students voting your explanations as
          helpful — not a score you type in.
        </p>
        {mode === 'signup' && (
          <>
            <label>
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Aigerim"
                autoComplete="nickname"
                required
              />
            </label>
            <label>
              Grade
              <select
                value={grade}
                onChange={(event) => setGrade(Number(event.target.value))}
                required
              >
                {GRADES.map((item) => (
                  <option key={item} value={item}>
                    Grade {item}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint tight">
              New accounts are students. Teachers are added by an admin.
            </p>
            <fieldset className="chip-set">
              <legend>Subjects I can teach</legend>
              {SUBJECTS.map((subject) => (
                <label key={subject} className="chip">
                  <input
                    type="checkbox"
                    checked={offers.includes(subject)}
                    onChange={() => toggle(offers, setOffers, subject)}
                  />
                  {subject}
                </label>
              ))}
            </fieldset>
            <fieldset className="chip-set">
              <legend>Subjects I need help with</legend>
              {SUBJECTS.map((subject) => (
                <label key={subject} className="chip">
                  <input
                    type="checkbox"
                    checked={needs.includes(subject)}
                    onChange={() => toggle(needs, setNeeds, subject)}
                  />
                  {subject}
                </label>
              ))}
            </fieldset>
          </>
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
        {message && <p className="form-error">{message}</p>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
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
