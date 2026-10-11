import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import EditProfile from '../components/EditProfile.jsx'
import ReputationBadge from '../components/ReputationBadge.jsx'
import { initials, voteCount } from '../lib/helpers.js'

export default function ProfilePage() {
  const { profile } = useAuth()
  const { explanations, votes, loading, error, reputation } = useAppData()
  const [editing, setEditing] = useState(false)
  const mine = explanations.filter((item) => item.authorId === profile.id)

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
      <h3 className="subhead">Explanations by {profile.displayName}</h3>
      {loading ? (
        <p className="hint">Loading…</p>
      ) : error ? (
        <p className="empty">Could not load your explanations.</p>
      ) : mine.length === 0 ? (
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
    </section>
  )
}
