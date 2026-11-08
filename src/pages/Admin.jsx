import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { decideTeacher, fetchTeacherRequests, fetchTeachers } from '../lib/adminApi.js'
import { formatTimeAgo, friendlyError, initials } from '../lib/helpers.js'

const DONE_TEXT = {
  approve: 'Approved. They now have teacher tools.',
  decline: 'Declined. The account stays a student account.',
  remove: 'Teacher rights removed.',
}

// Admin-only: approve or decline teacher sign-ups and remove teacher rights.
// The database checks every action, so this page is only a convenience.
export default function AdminPage() {
  const { profile } = useAuth()

  if (!profile.isAdmin) {
    return (
      <section>
        <h2>Admin</h2>
        <p className="empty">Only school admins can open this page.</p>
      </section>
    )
  }
  return <AdminLists meId={profile.id} />
}

function AdminLists({ meId }) {
  const { loadAll, showToast } = useAppData()
  const [requests, setRequests] = useState([])
  const [teachers, setTeachers] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([fetchTeacherRequests(), fetchTeachers()])
      .then(([nextRequests, nextTeachers]) => {
        if (!alive) return
        setRequests(nextRequests)
        setTeachers(nextTeachers)
        setLoadError('')
      })
      .catch((err) => alive && setLoadError(friendlyError(err)))
      .finally(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [reloadKey])

  async function decide(person, decision) {
    await decideTeacher(person.id, decision)
    showToast(DONE_TEXT[decision])
    setReloadKey((n) => n + 1)
    // Teacher badges, helper lists and the Review tab read the shared profiles.
    await loadAll()
  }

  if (!loaded) return <p className="hint">Loading…</p>

  return (
    <section>
      <h2>Admin</h2>
      {loadError && (
        <div className="empty">
          <p>{loadError}</p>
          <button type="button" className="react" onClick={() => setReloadKey((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}

      <h3 className="subhead">
        Teacher requests <span className="muted">({requests.length})</span>
      </h3>
      <p className="hint">
        Check that the email is a real school address and that you know this person before
        approving. Teachers can read reports, hide posts and chat with students.
      </p>
      {requests.length === 0 ? (
        <p className="empty">No teacher requests waiting.</p>
      ) : (
        <div className="stack">
          {requests.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              detail={`Signed up ${formatTimeAgo(person.createdAt)}`}
              actions={[
                { decision: 'approve', label: 'Approve', primary: true },
                {
                  decision: 'decline',
                  label: 'Decline',
                  confirm: `Decline ${person.displayName}? Their account stays a student account.`,
                },
              ]}
              onDecide={decide}
              onError={(err) => showToast(friendlyError(err))}
            />
          ))}
        </div>
      )}

      <h3 className="subhead">
        Teachers <span className="muted">({teachers.length})</span>
      </h3>
      <div className="stack">
        {teachers.map((person) => (
          <PersonCard
            key={person.id}
            person={person}
            detail={person.isAdmin ? 'Teacher · Admin' : 'Teacher'}
            actions={
              person.id === meId
                ? []
                : [
                    {
                      decision: 'remove',
                      label: 'Remove teacher',
                      confirm: `Remove teacher rights from ${person.displayName}? They become a student account.`,
                    },
                  ]
            }
            onDecide={decide}
            onError={(err) => showToast(friendlyError(err))}
          />
        ))}
      </div>
    </section>
  )
}

// One person with their buttons. Actions with `confirm` ask first.
function PersonCard({ person, detail, actions, onDecide, onError }) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(null)
  const running = useRef(false)

  async function run(action) {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      await onDecide(person, action.decision)
    } catch (err) {
      onError(err)
    } finally {
      running.current = false
      setBusy(false)
      setConfirming(null)
    }
  }

  return (
    <article className="card person-card">
      <div className="card-head">
        <span className="avatar sm" aria-hidden="true">
          {initials(person.displayName)}
        </span>
        <div className="person-copy">
          <strong>{person.displayName}</strong>
          <p className="meta person-email">{person.email}</p>
          <p className="meta">{detail}</p>
        </div>
      </div>
      {confirming ? (
        <div className="resolve-bar confirm" role="alert">
          <span>{confirming.confirm}</span>
          <button type="button" className="text-btn cancel" disabled={busy} onClick={() => setConfirming(null)}>
            Cancel
          </button>
          <button type="button" className="primary danger" disabled={busy} onClick={() => run(confirming)}>
            {busy ? 'Saving…' : confirming.label}
          </button>
        </div>
      ) : (
        actions.length > 0 && (
          <div className="actions">
            {actions.map((action) => (
              <button
                key={action.decision}
                type="button"
                className={action.primary ? 'primary' : 'react'}
                disabled={busy}
                onClick={() => (action.confirm ? setConfirming(action) : run(action))}
              >
                {busy && !action.confirm ? 'Saving…' : action.label}
              </button>
            ))}
          </div>
        )
      )}
    </article>
  )
}
