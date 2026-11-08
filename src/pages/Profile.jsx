import { useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { usePagedExplanations } from '../hooks/usePagedExplanations.js'
import EditProfile from '../components/EditProfile.jsx'
import LoadMore from '../components/LoadMore.jsx'
import ReputationBadge from '../components/ReputationBadge.jsx'
import { formatPostedAt, friendlyError, initials, voteCount } from '../lib/helpers.js'

export default function ProfilePage() {
  const { profile } = useAuth()
  const { votes, reputation, ratingSummary } = useAppData()
  const helpRating = ratingSummary[profile.id]
  const [editing, setEditing] = useState(false)
  const {
    items: mine,
    isLoading,
    error,
    hasMore,
    loadingMore,
    loadMore,
  } = usePagedExplanations({ authorId: profile.id })

  return (
    <section>
      <div className="profile-hero">
        <span className="avatar lg">{initials(profile.displayName)}</span>
        <div>
          <h2>{profile.displayName}</h2>
          <p className="hint tight">
            Grade {profile.grade ?? '—'} · {profile.role}
          </p>
          <p className="hint tight">
            Credibility is computed from other students’ votes, not a self-score.
          </p>
          <p className="help-rating">
            {helpRating ? (
              <>
                <span className="star on" aria-hidden="true">★</span>{' '}
                {helpRating.average.toFixed(1)} help rating
                <span className="muted">
                  {' '}
                  from {helpRating.count} {helpRating.count === 1 ? 'session' : 'sessions'}
                </span>
              </>
            ) : (
              <span className="muted">No help ratings yet. Help a classmate to get your first one.</span>
            )}
          </p>
        </div>
        {!editing && (
          <button type="button" className="react edit-profile-btn" onClick={() => setEditing(true)}>
            Edit profile
          </button>
        )}
      </div>
      {editing ? (
        <EditProfile onDone={() => setEditing(false)} />
      ) : (
        <div className="profile-grid">
          <div className="card">
            <h3>Can teach</h3>
            <p className="hint">Score = votes on their explanations in that subject.</p>
            <ul className="plain">
              {profile.offers.length === 0 ? (
                <li>
                  <span className="muted">None yet</span>
                </li>
              ) : (
                profile.offers.map((subj) => {
                  const score = reputation(profile.id, subj)
                  return (
                    <li key={subj}>
                      <span>
                        {subj}{' '}
                        <ReputationBadge score={score} subject={subj} />
                      </span>
                      <strong className="score">{score}</strong>
                    </li>
                  )
                })
              )}
            </ul>
          </div>
          <div className="card">
            <h3>Needs help with</h3>
            <p className="hint">No score — this is a request, not a claim.</p>
            <ul className="plain">
              {profile.needs.length === 0 ? (
                <li>
                  <span className="muted">None yet</span>
                </li>
              ) : (
                profile.needs.map((subj) => (
                  <li key={subj}>
                    <span>{subj}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
      <BlockedList />
      <h3 className="subhead">Explanations by {profile.displayName}</h3>
      {isLoading ? (
        <p className="hint">Loading…</p>
      ) : mine.length === 0 && !error ? (
        <p className="empty">None yet — publish one from Write.</p>
      ) : (
        <div className="stack">
          {mine.map((item) => (
            <article key={item.id} className="card">
              <p className="meta">
                {item.subject} · {voteCount(votes, item.id)} helpful · reputation{' '}
                {reputation(profile.id, item.subject)}
              </p>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      )}
      {!isLoading && (
        <LoadMore hasMore={hasMore} loadingMore={loadingMore} error={error} onLoadMore={loadMore} />
      )}
    </section>
  )
}

// Only the blocker sees this list; the blocked students are never told.
function BlockedList() {
  const { blocks, userById, unblockUser, showToast } = useAppData()
  const [busyId, setBusyId] = useState('')
  const saving = useRef(false)

  async function handleUnblock(userId, name) {
    if (saving.current) return
    saving.current = true
    setBusyId(userId)
    try {
      await unblockUser(userId, name)
    } catch (err) {
      showToast(friendlyError(err))
    } finally {
      saving.current = false
      setBusyId('')
    }
  }

  return (
    <div className="card blocked-card">
      <h3>Blocked students</h3>
      <p className="hint">
        You do not see their explanations, and you cannot send each other help requests or
        messages. They are not told.
      </p>
      {blocks.length === 0 ? (
        <p className="muted">You have not blocked anyone.</p>
      ) : (
        <ul className="plain blocked-list">
          {blocks.map((item) => {
            const name = userById[item.blockedId]?.displayName || 'Student'
            return (
              <li key={item.blockedId}>
                <span>
                  {name} <span className="muted">· since {formatPostedAt(item.createdAt)}</span>
                </span>
                <button
                  type="button"
                  className="react"
                  disabled={busyId === item.blockedId}
                  onClick={() => handleUnblock(item.blockedId, name)}
                >
                  {busyId === item.blockedId ? 'Unblocking…' : 'Unblock'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
