import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { feedbackStats, formatTimeAgo, initials } from '../lib/helpers.js'

const RATING_WORDS = ['', 'Very confusing', 'Confusing', 'Okay', 'Clear', 'Very clear']

export default function FeedbackThread({ explanationId, authorId }) {
  const { profile } = useAuth()
  const { feedback, userById, addFeedback, showToast } = useAppData()
  const meId = profile?.id
  const isAuthor = meId === authorId

  const { reviews, repliesByParent } = useMemo(() => {
    const mine = feedback.filter((item) => item.explanationId === explanationId)
    // Newest comments first; replies stay in the order they were written.
    const reviews = mine.filter((item) => !item.parentId).reverse()
    const repliesByParent = {}
    for (const item of mine) {
      if (!item.parentId) continue
      if (!repliesByParent[item.parentId]) repliesByParent[item.parentId] = []
      repliesByParent[item.parentId].push(item)
    }
    return { reviews, repliesByParent }
  }, [feedback, explanationId])

  const stats = feedbackStats(feedback, explanationId)
  const alreadyReviewed = reviews.some((item) => item.authorId === meId)

  return (
    <div className="feedback">
      <div className="feedback-summary">
        <strong>
          {stats.count} {stats.count === 1 ? 'comment' : 'comments'}
        </strong>
        {stats.average != null && (
          <span className="summary-clarity">
            <Stars value={stats.average} />
            {stats.average.toFixed(1)} average clarity
          </span>
        )}
      </div>

      {!isAuthor && meId && !alreadyReviewed && (
        <ReviewForm
          me={profile}
          explanationId={explanationId}
          onSave={addFeedback}
          onError={showToast}
        />
      )}
      {!isAuthor && alreadyReviewed && (
        <p className="feedback-note">You rated this explanation. Thanks for the feedback!</p>
      )}
      {isAuthor && (
        <p className="feedback-note">
          Readers rate how clear your explanation is. You can reply to their comments.
        </p>
      )}

      {reviews.length === 0 ? (
        <p className="feedback-empty">No comments yet. Be the first to say how clear this was.</p>
      ) : (
        <ul className="comment-list">
          {reviews.map((item) => (
            <li key={item.id} className="comment">
              <CommentBody
                item={item}
                user={userById[item.authorId]}
                isAuthor={item.authorId === authorId}
              />
              {((repliesByParent[item.id] ?? []).length > 0 || isAuthor) && (
                <div className="replies">
                  {(repliesByParent[item.id] ?? []).map((reply) => (
                    <div key={reply.id} className="comment reply">
                      <CommentBody
                        item={reply}
                        user={userById[reply.authorId]}
                        isAuthor={reply.authorId === authorId}
                        small
                      />
                    </div>
                  ))}
                  {isAuthor && (
                    <ReplyForm
                      me={profile}
                      explanationId={explanationId}
                      parentId={item.id}
                      onSave={addFeedback}
                      onError={showToast}
                    />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CommentBody({ item, user, isAuthor, small = false }) {
  const name = user?.displayName || 'Student'
  return (
    <div className="comment-row">
      <span className={small ? 'avatar xs' : 'avatar sm'}>{initials(name)}</span>
      <div className="comment-main">
        <p className="comment-head">
          <strong>{name}</strong>
          {isAuthor && <span className="author-tag">Author</span>}
          {user?.grade != null && <span className="comment-sub">Grade {user.grade}</span>}
          <span className="comment-sub">· {formatTimeAgo(item.createdAt)}</span>
        </p>
        {item.clarityRating != null && (
          <p className="comment-rating">
            <Stars value={item.clarityRating} />
            {RATING_WORDS[item.clarityRating]}
          </p>
        )}
        <p className="comment-text">{item.body}</p>
      </div>
    </div>
  )
}

function Stars({ value }) {
  const full = Math.round(value)
  return (
    <span className="stars" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= full ? 'star on' : 'star'} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  )
}

function ReviewForm({ me, explanationId, onSave, onError }) {
  const [body, setBody] = useState('')
  // No default: a pre-selected rating nudges readers toward that score.
  const [rating, setRating] = useState(null)
  const [hover, setHover] = useState(null)
  const [busy, setBusy] = useState(false)
  const shown = hover ?? rating

  async function submit(event) {
    event.preventDefault()
    const text = body.trim()
    if (!text || !rating) return
    setBusy(true)
    try {
      await onSave({
        explanationId,
        body: text,
        clarityRating: Number(rating),
      })
      setBody('')
      setRating(null)
    } catch (err) {
      onError(err.message || 'Could not save review')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <span className="avatar sm">{initials(me?.displayName)}</span>
      <div className="composer-main">
        <div className="rate-row">
          <span className="rate-label">How clear was this?</span>
          <div
            className="star-picker"
            role="radiogroup"
            aria-label="Clarity rating"
            onMouseLeave={() => setHover(null)}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <label
                key={value}
                className={shown && value <= shown ? 'star-pick on' : 'star-pick'}
                onMouseEnter={() => setHover(value)}
                title={RATING_WORDS[value]}
              >
                <input
                  type="radio"
                  name={`clarity-${explanationId}`}
                  value={value}
                  checked={rating === value}
                  onChange={() => setRating(value)}
                />
                ★
              </label>
            ))}
          </div>
          <span className="rate-word">{shown ? RATING_WORDS[shown] : 'Tap a star'}</span>
        </div>
        <textarea
          rows={2}
          maxLength={500}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What helped, or what is still confusing?"
          aria-label="Comment"
        />
        <div className="composer-actions">
          <span className="muted">{body.length}/500</span>
          <button type="submit" className="primary" disabled={busy || !body.trim() || !rating}>
            {busy ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </div>
    </form>
  )
}

function ReplyForm({ me, explanationId, parentId, onSave, onError }) {
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
      <button type="button" className="reply-btn" onClick={() => setOpen(true)}>
        Reply
      </button>
    )
  }

  return (
    <form className="composer reply-composer" onSubmit={submit}>
      <span className="avatar xs">{initials(me?.displayName)}</span>
      <div className="composer-main">
        <textarea
          rows={2}
          maxLength={500}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a reply…"
          aria-label="Reply"
          autoFocus
        />
        <div className="composer-actions">
          <button
            type="button"
            className="text-btn cancel"
            onClick={() => {
              setBody('')
              setOpen(false)
            }}
          >
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || !body.trim()}>
            {busy ? 'Posting…' : 'Reply'}
          </button>
        </div>
      </div>
    </form>
  )
}
