import { useState } from 'react'
import { GRADES, SUBJECTS } from '../config/subjects.js'

const STEPS = [
  { title: 'Your grade', hint: 'Step 1 of 3 — pick the grade you are in now.' },
  { title: 'What can you teach?', hint: 'Step 2 of 3 — pick subjects you can explain to a classmate.' },
  { title: 'Where do you need help?', hint: 'Step 3 of 3 — pick subjects you want help with.' },
]

export default function CompleteProfile({ onSave, existing }) {
  const [step, setStep] = useState(0)
  const [grade, setGrade] = useState(existing?.grade || 10)
  const [offers, setOffers] = useState(existing?.offers?.length ? existing.offers : [])
  const [needs, setNeeds] = useState(existing?.needs?.length ? existing.needs : [])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  function toggle(list, setList, subject) {
    setList((current) =>
      current.includes(subject)
        ? current.filter((item) => item !== subject)
        : [...current, subject],
    )
  }

  function next(event) {
    event.preventDefault()
    setMessage('')
    if (step === 0 && !grade) {
      setMessage('Pick your grade.')
      return
    }
    if (step === 1 && offers.length === 0) {
      setMessage('Pick at least one subject you can teach.')
      return
    }
    if (step < 2) {
      setStep((current) => current + 1)
      return
    }
    submit()
  }

  async function submit() {
    if (needs.length === 0) {
      setMessage('Pick at least one subject you need help with.')
      return
    }
    const displayName = existing?.displayName?.trim()
    if (!displayName) {
      setMessage('Your account is missing a display name. Sign out and sign up again.')
      return
    }
    setBusy(true)
    try {
      await onSave({
        displayName,
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

  const current = STEPS[step]

  return (
    <div className="auth-page">
      <form className="card form auth-card" onSubmit={next}>
        <p className="eyebrow">Welcome{existing?.displayName ? `, ${existing.displayName}` : ''}</p>
        <h1>{current.title}</h1>
        <p className="hint">{current.hint}</p>
        <div className="step-dots" aria-hidden="true">
          {STEPS.map((_, index) => (
            <span key={index} className={index === step ? 'dot on' : 'dot'} />
          ))}
        </div>
        {step === 0 && (
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
        )}
        {step === 1 && (
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
        )}
        {step === 2 && (
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
        )}
        {message && <p className="form-error">{message}</p>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : step === 2 ? 'Finish' : 'Continue'}
        </button>
        {step > 0 && (
          <button
            type="button"
            className="text-btn"
            onClick={() => {
              setMessage('')
              setStep((current) => current - 1)
            }}
          >
            Back
          </button>
        )}
      </form>
    </div>
  )
}
