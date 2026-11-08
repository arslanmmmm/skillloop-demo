import { useState } from 'react'
import { SUBJECTS } from '../config/subjects.js'
import { friendlyError } from '../lib/helpers.js'

// Same limits as the explanations_title_check and explanations_body_check
// constraints in schema.sql.
const TITLE_MAX = 120
const BODY_MAX = 4000

// Writing a new explanation or editing one. When editing, the subject is fixed
// (reputation is counted per subject).
export default function ExplanationForm({
  initial,
  subjectLocked = false,
  submitLabel,
  busyLabel,
  onSubmit,
  children,
}) {
  const [subject, setSubject] = useState(initial.subject)
  const [title, setTitle] = useState(initial.title)
  const [text, setText] = useState(initial.text)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const nextTitle = title.trim()
    const nextText = text.trim()
    if (!nextTitle || !nextText) {
      setFormError('Add a title and an explanation.')
      return
    }
    setFormError('')
    setBusy(true)
    try {
      await onSubmit({ subject, title: nextTitle, text: nextText })
    } catch (err) {
      setFormError(friendlyError(err))
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <label>
        Subject
        <select
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          disabled={subjectLocked}
        >
          {SUBJECTS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label>
        Title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={TITLE_MAX}
          placeholder="e.g. Balancing equations, explained simply"
        />
        <span className="field-count">
          {title.length}/{TITLE_MAX}
        </span>
      </label>
      <label>
        Explanation
        <textarea
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={BODY_MAX}
          placeholder="Explain it like the reader is 11 years old."
        />
        <span className={text.length >= BODY_MAX ? 'field-count at-limit' : 'field-count'}>
          {text.length}/{BODY_MAX}
        </span>
      </label>
      {children}
      {formError && <p className="form-error">{formError}</p>}
      <button type="submit" className="primary" disabled={busy}>
        {busy ? busyLabel : submitLabel}
      </button>
    </form>
  )
}
