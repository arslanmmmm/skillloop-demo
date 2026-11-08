import { useRef, useState } from 'react'
import { SUBJECTS } from '../config/subjects.js'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { formatPostedAt, friendlyError, voteCount } from '../lib/helpers.js'

const STATUS_LABELS = {
  none: 'Not reviewed',
  verified: 'Verified',
  needs_correction: 'Needs correction',
  hidden: 'Hidden',
}
const NOTE_MAX = 500

// Teacher-only page. The route is shown to everyone who types the address,
// but the database only lets teachers change review fields.
export default function ReviewPage() {
  const { profile } = useAuth()
  const { explanations, userById, votes, loading, error } = useAppData()
  const [subject, setSubject] = useState('all')
  const [status, setStatus] = useState('all')

  if (profile.role !== 'teacher') {
    return (
      <section>
        <h2>Review</h2>
        <p className="empty">Only teachers can open this page.</p>
      </section>
    )
  }

  // explanations is already newest first.
  const shown = explanations.filter(
    (item) =>
      (subject === 'all' || item.subject === subject) &&
      (status === 'all' || item.reviewStatus === status),
  )

  return (
    <section>
      <h2>Review explanations</h2>
      <p className="hint">
        Verify correct posts, flag ones that need correcting with a short note, or
        hide a post from students. Every action can be undone.
      </p>
      <div className="card form review-filters">
        <label>
          Subject
          <select value={subject} onChange={(event) => setSubject(event.target.value)}>
            <option value="all">All subjects</option>
            {SUBJECTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3 className="subhead">
        {shown.length} {shown.length === 1 ? 'explanation' : 'explanations'}
      </h3>
      {loading ? (
        <p className="hint">Loading…</p>
      ) : error ? (
        <p className="empty">Could not load explanations.</p>
      ) : shown.length === 0 ? (
        <p className="empty">Nothing matches these filters.</p>
      ) : (
        <div className="stack">
          {shown.map((item) => (
            <ReviewCard
              key={item.id}
              item={item}
              author={userById[item.authorId]}
              helpful={voteCount(votes, item.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ReviewCard({ item, author, helpful }) {
  const { reviewExplanation, showToast } = useAppData()
  const [writingNote, setWritingNote] = useState(false)
  const [note, setNote] = useState(item.teacherNote || '')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)

  async function review(status, teacherNote = null) {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    try {
      await reviewExplanation(item.id, status, teacherNote)
      setWritingNote(false)
      showToast(
        {
          none: 'Review undone.',
          verified: 'Marked as verified.',
          needs_correction: 'Flagged for correction.',
          hidden: 'Hidden from students.',
        }[status],
      )
    } catch (err) {
      showToast(friendlyError(err))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <article className="card review-card">
      <div className="review-head">
        <p className="meta">
          {author?.displayName || 'Student'} · Grade {author?.grade ?? '—'} · {item.subject} ·{' '}
          {formatPostedAt(item.createdAt)} · {helpful} helpful
        </p>
        <span className={`status-pill review-${item.reviewStatus}`}>
          {STATUS_LABELS[item.reviewStatus]}
        </span>
      </div>
      <h3>{item.title}</h3>
      <p className="post-body review-body">{item.text}</p>
      {item.reviewStatus === 'needs_correction' && item.teacherNote && (
        <p className="review-note">Your note: {item.teacherNote}</p>
      )}

      {writingNote ? (
        <form
          className="form review-note-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (note.trim()) review('needs_correction', note.trim())
          }}
        >
          <label>
            What needs correcting? (students see this)
            <textarea
              rows={2}
              maxLength={NOTE_MAX}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. The date is wrong; check page 42."
              autoFocus
            />
          </label>
          <div className="form-actions">
            <button type="button" className="text-btn cancel" onClick={() => setWritingNote(false)}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={busy || !note.trim()}>
              Flag post
            </button>
          </div>
        </form>
      ) : (
        <div className="actions review-actions">
          {item.reviewStatus !== 'verified' && (
            <button type="button" className="react verify-btn" disabled={busy} onClick={() => review('verified')}>
              ✓ Verify
            </button>
          )}
          {item.reviewStatus !== 'needs_correction' && (
            <button type="button" className="react" disabled={busy} onClick={() => setWritingNote(true)}>
              ⚠ Needs correction
            </button>
          )}
          {item.reviewStatus !== 'hidden' && (
            <button type="button" className="react" disabled={busy} onClick={() => review('hidden')}>
              Hide
            </button>
          )}
          {item.reviewStatus !== 'none' && (
            <button type="button" className="text-btn undo-btn" disabled={busy} onClick={() => review('none')}>
              Undo
            </button>
          )}
        </div>
      )}
    </article>
  )
}
