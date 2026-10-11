import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { formatPostedAt } from '../lib/helpers.js'

export default function FeedbackThread({ explanationId, authorId }) {
  const { profile } = useAuth()
  const { feedback, userById, addFeedback, showToast } = useAppData()
  const meId = profile?.id
  const isAuthor = meId === authorId

  const { reviews, repliesByParent } = useMemo(() => {
    const mine = feedback.filter((item) => item.explanationId === explanationId)
    const reviews = mine.filter((item) => !item.parentId)
    const repliesByParent = {}
    for (const item of mine) {
      if (!item.parentId) continue
      if (!repliesByParent[item.parentId]) repliesByParent[item.parentId] = []
      repliesByParent[item.parentId].push(item)
    }
    return { reviews, repliesByParent }
  }, [feedback, explanationId])

  const alreadyReviewed = reviews.some((item) => item.authorId === meId)

  return (
    <div className="feedback">
      {reviews.length === 0 ? (
        <p className="muted">No comments yet.</p>
      ) : (
        <ul className="comment-list">
          {reviews.map((item) => (
            <li key={item.id} className="comment">
              <p>
                <strong>{userById[item.authorId]?.displayName || 'Student'}</strong>
                <span className="muted">
                  {' '}
                  · {item.clarityRating}/5 clear · {formatPostedAt(item.createdAt)}
                </span>
              </p>
              <p>{item.body}</p>
              {(repliesByParent[item.id] ?? []).map((reply) => (
                <div key={reply.id} className="reply">
                  <p>
                    <strong>{userById[reply.authorId]?.displayName || 'Author'}</strong>
                    <span className="muted"> · reply · {formatPostedAt(reply.createdAt)}</span>
                  </p>
                  <p>{reply.body}</p>
                </div>
              ))}
              {isAuthor && (
                <ReplyForm
                  explanationId={explanationId}
                  parentId={item.id}
                  onSave={addFeedback}
                  onError={showToast}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {!isAuthor && meId && !alreadyReviewed && (
        <ReviewForm
          explanationId={explanationId}
          onSave={addFeedback}
          onError={showToast}
        />
      )}
      {!isAuthor && alreadyReviewed && (
        <p className="muted">You already left a review.</p>
      )}
    </div>
  )
}

function ReviewForm({ explanationId, onSave, onError }) {
  const [body, setBody] = useState('')
  const [rating, setRating] = useState(4)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const text = body.trim()
    if (!text) return
    setBusy(true)
    try {
      await onSave({
        explanationId,
        body: text,
        clarityRating: Number(rating),
      })
      setBody('')
    } catch (err) {
      onError(err.message || 'Could not save review')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="comment-form" onSubmit={submit}>
      <p className="form-label">How clear was this?</p>
      <div className="rating" role="radiogroup" aria-label="Clarity rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <label key={value} className={Number(rating) === value ? 'rate on' : 'rate'}>
            <input
              type="radio"
              name={`clarity-${explanationId}`}
              value={value}
              checked={Number(rating) === value}
              onChange={() => setRating(value)}
            />
            {value}
          </label>
        ))}
      </div>
      <label>
        Comment
        <textarea
          rows={2}
          maxLength={500}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What helped, or what is still confusing?"
        />
      </label>
      <button type="submit" className="primary" disabled={busy || !body.trim()}>
        {busy ? 'Saving…' : 'Post review'}
      </button>
    </form>
  )
}

function ReplyForm({ explanationId, parentId, onSave, onError }) {
  const [body, setBody] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const text = body.trim()
    if (!text) return
    setBusy(true)
    try {
      await onSave({
        explanationId,
        parentId,
        body: text,
      })
      setBody('')
      setOpen(false)
    } catch (err) {
      onError(err.message || 'Could not save reply')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="text-btn inline" onClick={() => setOpen(true)}>
        Reply
      </button>
    )
  }

  return (
    <form className="comment-form nested" onSubmit={submit}>
      <label>
        Reply
        <textarea
          rows={2}
          maxLength={500}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      <button type="submit" className="primary" disabled={busy || !body.trim()}>
        {busy ? 'Saving…' : 'Post reply'}
      </button>
    </form>
  )
}
