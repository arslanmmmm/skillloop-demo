import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { toggleItem, toggleOffer, validateProfileChoices } from '../lib/helpers.js'
import { GradePicker, SubjectPicker } from './ProfilePickers.jsx'

export default function EditProfile({ onDone }) {
  const { profile, completeProfile } = useAuth()
  const { loadAll, showToast } = useAppData()
  const [grade, setGrade] = useState(profile.grade ?? null)
  const [offers, setOffers] = useState(profile.offers)
  const [needs, setNeeds] = useState(profile.needs)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  function pickOffer(subject) {
    setMessage('')
    const next = toggleOffer(offers, needs, subject)
    setOffers(next.offers)
    setNeeds(next.needs)
  }

  async function save(event) {
    event.preventDefault()
    const problem = validateProfileChoices({ grade, offers, needs })
    if (problem) {
      setMessage(problem)
      return
    }
    setBusy(true)
    try {
      await completeProfile({ displayName: profile.displayName, grade, offers, needs })
      // Other students' helper lists and your matches read from the shared data.
      await loadAll()
      showToast('Profile updated.')
      onDone()
    } catch (err) {
      setMessage(err.message || 'Could not save your profile.')
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={save}>
      <h3>Edit profile</h3>
      <p className="hint tight">
        Your reputation stays the same. It comes from votes on your explanations,
        not from the subjects you list here.
      </p>
      <GradePicker
        value={grade}
        onChange={(item) => {
          setGrade(item)
          setMessage('')
        }}
      />
      <SubjectPicker legend="Subjects I can teach" selected={offers} onToggle={pickOffer} />
      <SubjectPicker
        legend="Subjects I need help with"
        selected={needs}
        onToggle={(subject) => {
          setMessage('')
          setNeeds(toggleItem(needs, subject))
        }}
        locked={offers}
        lockedTitle="You said you can teach this"
      />
      {message && <p className="form-error">{message}</p>}
      <div className="form-actions">
        <button type="button" className="text-btn cancel" onClick={onDone} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
