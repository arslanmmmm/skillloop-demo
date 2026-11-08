import { useState } from 'react'

const NOTE_MAX = 500

// The teacher's "needs correction" note, used on the Review list and in Reports.
// The note is shown on the post to its author and to readers.
export default function CorrectionNoteForm({ initialNote = '', busy, submitLabel, onSubmit, onCancel }) {
  const [note, setNote] = useState(initialNote)

  function handleSubmit(event) {
    event.preventDefault()
    if (note.trim()) onSubmit(note.trim())
  }

  return (
    <form className="form review-note-form" onSubmit={handleSubmit}>
      <label>
        What needs correcting?
        <textarea
          rows={2}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. The date is wrong; check page 42."
          autoFocus
        />
      </label>
      <p className="muted note-help">
        The student and readers see this note on the post, and the student can edit the
        post to fix it. Write about the content, not the student.
      </p>
      <div className="form-actions">
        <button type="button" className="text-btn cancel" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy || !note.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
