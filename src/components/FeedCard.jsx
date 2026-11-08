import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { useVote } from '../hooks/useVote.js'
import { feedbackStats, formatPostedAt, initials, roleLabel, voteCount } from '../lib/helpers.js'
import BlockConfirm from './BlockConfirm.jsx'
import FeedbackThread from './FeedbackThread.jsx'
import ReportForm from './ReportForm.jsx'
import ReputationBadge from './ReputationBadge.jsx'

export default function FeedCard({ item, author }) {
  const { profile } = useAuth()
  const { votes, toggleVote, reputation, feedback } = useAppData()
  const { isOwn, canVote, voted, toggle } = useVote({
    explanation: item,
    userId: profile?.id,
    votes,
    toggleVote,
  })
  const [open, setOpen] = useState(false)
  // Which safety panel is open under the post: 'report', 'block' or ''.
  const [panel, setPanel] = useState('')
  // Teachers use the Review page instead of reporting or blocking.
  const canReport = !isOwn && profile?.role !== 'teacher'
  const helpful = voteCount(votes, item.id)
  const score = reputation(item.authorId, item.subject)
  const stats = feedbackStats(feedback, item.id)

  return (
    <article className="card post">
      <div className="card-head">
        <span className="avatar">{initials(author?.displayName || '?')}</span>
        <div>
          <strong>
            {author?.displayName || 'Unknown'}{' '}
            <ReputationBadge score={score} subject={item.subject} />
          </strong>
          <p className="meta">
            {roleLabel(author)} · {item.subject} · {formatPostedAt(item.createdAt)}
            {item.editedAt ? ' · edited' : ''}
          </p>
        </div>
      </div>
      <ReviewNotice item={item} isAuthor={isOwn} />
      <h3>{item.title}</h3>
      <p className="post-body">{item.text}</p>
      <div className="actions">
        <button
          type="button"
          className={voted ? 'react on' : 'react'}
          disabled={!canVote}
          title={isOwn ? 'You cannot vote on your own explanation' : undefined}
          onClick={toggle}
        >
          Helpful · {helpful}
        </button>
        <button
          type="button"
          className={open ? 'react on' : 'react'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {stats.count === 0 ? 'Comment' : `Comments · ${stats.count}`}
        </button>
        {stats.average != null && (
          <span className="clarity-pill" title="Average clarity rating from readers">
            <span className="star on" aria-hidden="true">★</span>
            {stats.average.toFixed(1)} clarity
          </span>
        )}
        {canReport && (
          <span className="safety-actions">
            <button
              type="button"
              className={panel === 'report' ? 'react on' : 'react'}
              aria-expanded={panel === 'report'}
              onClick={() => setPanel(panel === 'report' ? '' : 'report')}
            >
              Report
            </button>
            {author?.role !== 'teacher' && (
              <button
                type="button"
                className={panel === 'block' ? 'react on' : 'react'}
                aria-expanded={panel === 'block'}
                onClick={() => setPanel(panel === 'block' ? '' : 'block')}
              >
                Block
              </button>
            )}
          </span>
        )}
      </div>
      {panel === 'report' && (
        <ReportForm
          targetType="explanation"
          targetId={item.id}
          what="explanation"
          onClose={() => setPanel('')}
        />
      )}
      {panel === 'block' && <BlockConfirm user={author} onClose={() => setPanel('')} />}
      {open && <FeedbackThread explanationId={item.id} authorId={item.authorId} />}
    </article>
  )
}

// What students see after a teacher review. Hidden posts only reach the
// author and teachers (the database filters them out for everyone else).
function ReviewNotice({ item, isAuthor }) {
  if (item.reviewStatus === 'verified') {
    return <p className="review-badge verified">✓ Verified by teacher</p>
  }
  if (item.reviewStatus === 'needs_correction') {
    return (
      <div className="review-box warn" role="note">
        <strong>⚠ A teacher says this needs correction</strong>
        {item.teacherNote && <p>{item.teacherNote}</p>}
      </div>
    )
  }
  if (item.reviewStatus === 'hidden') {
    return (
      <div className="review-box hidden" role="note">
        <strong>Hidden by teacher</strong>
        <p>
          {isAuthor
            ? 'Other students cannot see this post. Ask your teacher what to change.'
            : 'Students cannot see this post.'}
        </p>
      </div>
    )
  }
  return null
}

export function FeedSkeleton() {
  return (
    <div className="stack">
      {[1, 2, 3].map((key) => (
        <div key={key} className="card skeleton-card" aria-hidden="true">
          <div className="skel skel-row" />
          <div className="skel skel-title" />
          <div className="skel skel-body" />
        </div>
      ))}
    </div>
  )
}
