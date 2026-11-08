import { useId, useRef, useState } from 'react'
import { REPORT_DETAILS_MAX, REPORT_REASONS } from '../config/reports.js'
import { useAppData } from '../hooks/useAppData.js'
import { friendlyError } from '../lib/helpers.js'

// Report one chat message or explanation to a teacher. The reported student
// is never told who reported them.
export default function ReportForm({ targetType, targetId, what, onClose }) {
  const { reportContent } = useAppData()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  // Blocks a second submit in the same instant, before `busy` disables the button.
  const sending = useRef(false)
  const groupName = useId()

  async function handleSubmit(event) {
    event.preventDefault()
    if (!reason || sending.current) return
    sending.current = true
    setBusy(true)
    setFormError('')
    try {
      await reportContent({ targetType, targetId, reason, details: details.trim() })
      onClose()
    } catch (err) {
      setFormError(friendlyError(err))
      setBusy(false)
    } finally {
      sending.current = false
    }
  }

  return (
    <form className="form safety-panel" onSubmit={handleSubmit}>
      <p className="safety-title">Report this {what} to a teacher</p>
      <p className="muted safety-hint">The student will not see who reported them.</p>
      <fieldset className="reason-list">
        <legend>Why are you reporting it?</legend>
        {Object.entries(REPORT_REASONS).map(([value, label]) => (
          <label key={value} className={reason === value ? 'reason on' : 'reason'}>
            <input
              type="radio"
              name={groupName}
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label>
        Anything else a teacher should know? (optional)
        <textarea
          rows={2}
          maxLength={REPORT_DETAILS_MAX}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
      </label>
      {formError && <p className="form-error">{formError}</p>}
      <div className="form-actions">
        <button type="button" className="text-btn cancel" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy || !reason}>
          {busy ? 'Sending…' : reason ? 'Send report' : 'Pick a reason'}
        </button>
      </div>
    </form>
  )
}
