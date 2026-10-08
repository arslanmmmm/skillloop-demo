import { useState } from 'react'
import { GRADES, SUBJECTS } from '../config/subjects.js'

export default function CompleteProfile({ onSave, existing }) {
  const [displayName, setDisplayName] = useState(existing?.displayName || '')
  const [grade, setGrade] = useState(existing?.grade || 10)
  const [offers, setOffers] = useState(existing?.offers?.length ? existing.offers : ['Math'])
  const [needs, setNeeds] = useState(existing?.needs?.length ? existing.needs : ['History'])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

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
    if (!displayName.trim() || !grade || offers.length === 0 || needs.length === 0) {
      setMessage('Name, grade, at least one offer, and one need are required.')
      return
    }
    setBusy(true)
    try {
      await onSave({
        displayName: displayName.trim(),
        grade: Number(grade),
        offers,
        needs,
      })
    } catch (err) {
      setMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="card form auth-card" onSubmit={submit}>
        <p className="eyebrow">Almost there</p>
        <h1>Finish your profile</h1>
        <p className="hint">
          Choose your grade and the subjects you can teach or need help with.
        </p>
        <label>
          Display name
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
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
        {message && <p className="form-error">{message}</p>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  )
}
