import { FeedSkeleton } from '../components/FeedCard.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { initials } from '../lib/helpers.js'

export default function MatchesPage() {
  const { profile } = useAuth()
  const { matches, loading, error, requestedIds, requestTrade, reputation } =
    useAppData()

  return (
    <section>
      <h2>Suggested trades</h2>
      <p className="hint">
        Partners who can teach what {profile.displayName} needs, and need what{' '}
        {profile.displayName} can teach. Ranked by the helper’s subject
        reputation from votes.
      </p>
      {loading ? (
        <FeedSkeleton />
      ) : error ? (
        <p className="empty">Could not load matches.</p>
      ) : matches.length === 0 ? (
        <p className="empty">
          No complementary trades yet. Ask a classmate to sign up with overlapping
          subjects (they teach what you need, and you teach what they need).
        </p>
      ) : (
        <div className="stack">
          {matches.map((match) => {
            const sent = requestedIds.includes(match.user.id)
            return (
              <article key={match.user.id} className="card">
                <div className="card-head">
                  <span className="avatar">{initials(match.user.displayName)}</span>
                  <div>
                    <strong>{match.user.displayName}</strong>
                    <p className="meta">
                      Grade {match.user.grade ?? '—'} · complementary offer / need
                    </p>
                  </div>
                </div>
                <ul className="plain">
                  {match.theyTeach.map((row) => (
                    <li key={row.subject}>
                      <span>
                        They can teach you <strong>{row.subject}</strong>
                      </span>
                      <strong className="score">{row.score}</strong>
                    </li>
                  ))}
                  {match.youTeach.map((subj) => (
                    <li key={subj}>
                      <span>
                        You can teach them <strong>{subj}</strong>
                      </span>
                      <span className="muted">
                        your score: {reputation(profile.id, subj)}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="primary"
                  disabled={sent}
                  onClick={() => requestTrade(match.user.id, match.user.displayName)}
                >
                  {sent ? 'Request sent' : 'Request trade'}
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
