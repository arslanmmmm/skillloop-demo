import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { useVote } from '../hooks/useVote.js'
import { formatPostedAt, initials, voteCount } from '../lib/helpers.js'

export default function FeedCard({ item, author }) {
  const { profile } = useAuth()
  const { votes, toggleVote, reputation } = useAppData()
  const { isOwn, canVote, voted, toggle } = useVote({
    explanation: item,
    userId: profile?.id,
    votes,
    toggleVote,
  })
  const helpful = voteCount(votes, item.id)
  const score = reputation(item.authorId, item.subject)

  return (
    <article className="card post">
      <div className="card-head">
        <span className="avatar">{initials(author?.displayName || '?')}</span>
        <div>
          <strong>{author?.displayName || 'Unknown'}</strong>
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
      </div>
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
