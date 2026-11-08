import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FeedSkeleton } from '../components/FeedCard.jsx'
import ReputationBadge from '../components/ReputationBadge.jsx'
import { SUBJECTS } from '../config/subjects.js'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { findHelpers, formatTimeAgo, friendlyError, initials } from '../lib/helpers.js'

const STATUS_TEXT = {
  pending: 'Waiting for an answer',
  accepted: 'Accepted',
  declined: 'Declined',
  resolved: 'Resolved',
}

export default function MatchesPage() {
  const { profile } = useAuth()
  const {
    users,
    reputationByUser,
    questions,
    helpRequests,
    userById,
    loading,
    error,
    sendHelpRequest,
    respondToHelpRequest,
    showToast,
    helpRatings,
    ratingSummary,
  } = useAppData()

  const [subject, setSubject] = useState(profile.needs[0] || SUBJECTS[0])
  // Which helper's request form is open, so only one is open at a time.
  const [openFormFor, setOpenFormFor] = useState('')
  // The request being accepted or declined. The ref blocks a second click in
  // the same instant; the state disables both buttons until the save finishes.
  const responding = useRef(null)
  const [respondingId, setRespondingId] = useState(null)

  const helpers = useMemo(
    () => findHelpers(users, reputationByUser, profile, subject),
    [users, reputationByUser, profile, subject],
  )
  const incoming = useMemo(
    () => helpRequests.filter((item) => item.helperId === profile.id),
    [helpRequests, profile.id],
  )
  const outgoing = useMemo(
    () => helpRequests.filter((item) => item.requesterId === profile.id),
    [helpRequests, profile.id],
  )

  // Subjects you said you need help with come first; any subject can be picked.
  const subjectOptions = [
    ...profile.needs,
    ...SUBJECTS.filter((item) => !profile.needs.includes(item)),
  ]

  // helpRequests is newest first, so this is the latest request to that helper.
  function latestRequest(helperId) {
    return outgoing.find(
      (item) => item.helperId === helperId && item.subject === subject,
    )
  }

  async function respond(requestId, status) {
    if (responding.current) return
    responding.current = requestId
    setRespondingId(requestId)
    try {
      await respondToHelpRequest(requestId, status)
    } catch (err) {
      showToast(friendlyError(err))
    } finally {
      responding.current = null
      setRespondingId(null)
    }
  }

  // The student who asked can rate once the request is resolved, one time only.
  function canRate(item) {
    return (
      item.status === 'resolved' &&
      item.requesterId === profile.id &&
      !helpRatings.some((rating) => rating.requestId === item.id)
    )
  }

  // Requests sent before topics existed may have a linked question instead.
  function requestTopic(item) {
    return item.topic || questions.find((q) => q.id === item.questionId)?.body || ''
  }

  return (
    <section>
      <h2>Ask for help</h2>
      <p className="hint">
        Pick a subject to see everyone who teaches it, ranked by helpful votes in
        that subject, then by how close their grade is to yours. Then tell a
        helper which topic you are stuck on.
      </p>

      <div className="card form">
        <label>
          Subject
          <select
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value)
              setOpenFormFor('')
            }}
          >
            {subjectOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      {incoming.length > 0 && (
        <>
          <h3 className="subhead">Requests for you</h3>
          <div className="stack">
            {incoming.map((item) => {
              const who = userById[item.requesterId]
              return (
                <article key={item.id} className="card request-card">
                  <div className="card-head">
                    <span className="avatar sm">{initials(who?.displayName)}</span>
                    <div>
                      <strong>{who?.displayName || 'Student'}</strong>
                      <p className="meta">
                        Grade {who?.grade ?? '—'} · asked {formatTimeAgo(item.createdAt)}
                      </p>
                    </div>
                    <StatusPill status={item.status} forHelper />
                  </div>
                  <RequestDetails
                    subject={item.subject}
                    topic={requestTopic(item)}
                    message={item.message}
                  />
                  <ChatLink request={item} />
                  {item.status === 'pending' && (
                    <div className="actions">
                      <button
                        type="button"
                        className="primary"
                        disabled={respondingId === item.id}
                        onClick={() => respond(item.id, 'accepted')}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="react"
                        disabled={respondingId === item.id}
                        onClick={() => respond(item.id, 'declined')}
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}

      <h3 className="subhead">Who can help with {subject}</h3>
      {loading ? (
        <FeedSkeleton />
      ) : error ? (
        <p className="empty">Could not load helpers.</p>
      ) : helpers.length === 0 ? (
        <p className="empty">
          Nobody teaches {subject} yet. Ask a classmate to sign up and pick it as
          a subject they can teach.
        </p>
      ) : (
        <div className="stack">
          {helpers.map(({ user, score, youTeach }) => {
            const existing = latestRequest(user.id)
            const formOpen = openFormFor === user.id
            return (
              <article key={user.id} className="card">
                <div className="card-head">
                  <span className="avatar">{initials(user.displayName)}</span>
                  <div>
                    <strong>
                      {user.displayName}{' '}
                      <ReputationBadge score={score} subject={subject} />
                      {youTeach.length > 0 && <span className="badge tier-trade">Trade</span>}
                    </strong>
                    <p className="meta">
                      Grade {user.grade ?? '—'} · {score} helpful{' '}
                      {score === 1 ? 'vote' : 'votes'} in {subject}
                    </p>
                    {ratingSummary[user.id] && <HelpRating summary={ratingSummary[user.id]} />}
                  </div>
                </div>
                {youTeach.length > 0 && (
                  <p className="muted trade-note">
                    You can teach them back: {youTeach.join(', ')}
                  </p>
                )}
                {existing ? (
                  <div className="sent-row">
                    <StatusPill status={existing.status} />
                    {requestTopic(existing) && (
                      <span className="muted">Topic: {requestTopic(existing)}</span>
                    )}
                    <ChatLink request={existing} canRate={canRate(existing)} />
                  </div>
                ) : formOpen ? (
                  <RequestForm
                    helper={user}
                    subject={subject}
                    onSend={sendHelpRequest}
                    onError={showToast}
                    onClose={() => setOpenFormFor('')}
                  />
                ) : (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setOpenFormFor(user.id)}
                  >
                    Ask for help
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}

      {outgoing.length > 0 && (
        <>
          <h3 className="subhead">Your requests</h3>
          <div className="stack">
            {outgoing.map((item) => {
              const helper = userById[item.helperId]
              return (
                <article key={item.id} className="card request-card">
                  <div className="card-head">
                    <span className="avatar sm">{initials(helper?.displayName)}</span>
                    <div>
                      <strong>To {helper?.displayName || 'Student'}</strong>
                      <p className="meta">
                        Grade {helper?.grade ?? '—'} · sent {formatTimeAgo(item.createdAt)}
                      </p>
                    </div>
                    <StatusPill status={item.status} />
                  </div>
                  <RequestDetails
                    subject={item.subject}
                    topic={requestTopic(item)}
                    message={item.message}
                  />
                  <ChatLink request={item} canRate={canRate(item)} />
                </article>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

// Only accepted and resolved requests have a chat; a resolved one the student
// has not rated yet invites them to rate their helper.
function ChatLink({ request, canRate = false }) {
  if (request.status !== 'accepted' && request.status !== 'resolved') return null
  const label =
    request.status === 'accepted' ? 'Open chat' : canRate ? 'Rate your helper' : 'View chat'
  return (
    <Link
      to={`/chat/${request.id}`}
      className={request.status === 'accepted' || canRate ? 'primary link-btn' : 'react link-btn'}
    >
      {label}
    </Link>
  )
}

function HelpRating({ summary }) {
  return (
    <p className="help-rating">
      <span className="star on" aria-hidden="true">★</span> {summary.average.toFixed(1)} help rating
      <span className="muted"> ({summary.count} {summary.count === 1 ? 'session' : 'sessions'})</span>
    </p>
  )
}

// The helper sees "Needs your answer" where the requester sees "Waiting for an answer".

function StatusPill({ status, forHelper = false }) {
  const text = forHelper && status === 'pending' ? 'Needs your answer' : STATUS_TEXT[status]
  return <span className={`status-pill status-${status}`}>{text}</span>
}

function RequestDetails({ subject, topic, message }) {
  return (
    <div className="request-details">
      <p className="request-topic">
        <span className="badge">{subject}</span>
        <strong>{topic || 'No topic given'}</strong>
      </p>
      {message && <p className="request-message">{message}</p>}
    </div>
  )
}

function RequestForm({ helper, subject, onSend, onError, onClose }) {
  const [topic, setTopic] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  // Blocks a second submit in the same instant, before `busy` disables the button.
  const sending = useRef(false)

  async function submit(event) {
    event.preventDefault()
    const cleanTopic = topic.trim()
    if (!cleanTopic || sending.current) return
    sending.current = true
    setBusy(true)
    try {
      await onSend({
        helperId: helper.id,
        subject,
        topic: cleanTopic,
        message: message.trim() || null,
        helperName: helper.displayName,
      })
      onClose()
    } catch (err) {
      onError(friendlyError(err))
      setBusy(false)
    } finally {
      sending.current = false
    }
  }

  return (
    <form className="request-form form" onSubmit={submit}>
      <p className="request-form-title">
        Ask {helper.displayName} for help with <strong>{subject}</strong>
      </p>
      <label>
        Topic
        <input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          maxLength={120}
          placeholder="e.g. Solving quadratic equations"
          autoFocus
          required
        />
      </label>
      <label>
        What do you need? (optional)
        <textarea
          rows={3}
          maxLength={1000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Say what you tried and where you got stuck."
        />
      </label>
      <div className="form-actions">
        <button type="button" className="text-btn cancel" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy || !topic.trim()}>
          {busy ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </form>
  )
}
