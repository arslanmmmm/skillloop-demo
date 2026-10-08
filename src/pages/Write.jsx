import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SUBJECTS } from '../config/subjects.js'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'

export default function WritePage() {
  const { profile } = useAuth()
  const { addExplanation, showToast } = useAppData()
  const [subject, setSubject] = useState(profile.offers[0] || SUBJECTS[0])
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const navigate = useNavigate()

  async function submit(event) {
    event.preventDefault()
    const nextTitle = title.trim()
    const nextText = text.trim()
    if (!nextTitle || !nextText) {
      setFormError('Add a title and an explanation.')
      return
    }
    setFormError('')
    setBusy(true)
    try {
      await addExplanation({ subject, title: nextTitle, text: nextText })
      setTitle('')
      setText('')
      showToast('Posted. Votes from others will raise your reputation.')
      navigate('/feed')
    } catch (err) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Write an explanation</h2>
      <p className="hint">
        Posted as {profile.displayName}. After it is on the feed, a helpful vote
        from someone else raises your {subject} reputation.
      </p>
      <form className="card form" onSubmit={submit}>
        <label>
          Subject
          <select
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
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
            placeholder="e.g. Balancing equations, explained simply"
          />
        </label>
        <label>
          Explanation
          <textarea
            rows={5}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Explain it like the reader is 11 years old."
          />
        </label>
        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Publishing…' : 'Publish to the board'}
        </button>
      </form>
    </section>
  )
}
