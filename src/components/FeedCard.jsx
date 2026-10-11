import { useState } from 'react'
import { reputationLabel } from '../config/reputation.js'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { useVote } from '../hooks/useVote.js'
import { feedbackStats, formatPostedAt, initials, voteCount } from '../lib/helpers.js'
import FeedbackThread from './FeedbackThread.jsx'

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
  const helpful = voteCount(votes, item.id)
  const score = reputation(item.authorId, item.subject)
  const label = reputationLabel(score)
  const stats = feedbackStats(feedback, item.id)

  return (
    <article className="card post">
      <div className="card-head">
        <span className="avatar">{initials(author?.displayName || '?')}</span>
        <div>
          <strong>
            {author?.displayName || 'Unknown'}{' '}
            <span className="badge">{label}</span>
          </strong>
          <p className="meta">
            Grade {author?.grade ?? '—'} · {item.subject} · {formatPostedAt(item.createdAt)}{' '}
            · reputation in {item.subject}: {score}
          </p>
        </div>
      </div>
      <h3>{item.title}</h3>
      <p>{item.text}</p>
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
        <button type="button" className="react" onClick={() => setOpen((value) => !value)}>
          {stats.count === 0
            ? 'Comments'
            : `Comments · ${stats.count}${stats.average != null ? ` · ${stats.average}/5 clear` : ''}`}
        </button>
      </div>
      {open && <FeedbackThread explanationId={item.id} authorId={item.authorId} />}
    </article>
  )
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
