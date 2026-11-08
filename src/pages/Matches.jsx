import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FeedSkeleton } from '../components/FeedCard.jsx'
import ReputationBadge from '../components/ReputationBadge.jsx'
import { SUBJECTS } from '../config/subjects.js'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { findHelpers, formatTimeAgo, friendlyError, initials, roleLabel } from '../lib/helpers.js'

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
    blockedIds,
  } = useAppData()

  // The tab lives in the address (?tab=requests) so "Back to Help" from a chat
  // returns to the request list.
  const [params, setParams] = useSearchParams()
  // Teachers are helpers: they only answer requests, never look for a helper.
  const isTeacher = profile.role === 'teacher'
  const tab = isTeacher || params.get('tab') === 'requests' ? 'requests' : 'find'
  const [subject, setSubject] = useState(profile.needs[0] || SUBJECTS[0])
  // Which helper's request form is open, so only one is open at a time.
  const [openFormFor, setOpenFormFor] = useState('')
  const [showPast, setShowPast] = useState(false)
  // The request being accepted or declined. The ref blocks a second click in
  // the same instant; the state disables both buttons until the save finishes.
  const responding = useRef(null)
  const [respondingId, setRespondingId] = useState(null)

  // Students I blocked are left out: the database would refuse the request anyway.
  const helpers = useMemo(
    () =>
      findHelpers(users, reputationByUser, profile, subject).filter(
        ({ user }) => !blockedIds.has(user.id),
      ),
    [users, reputationByUser, profile, subject, blockedIds],
  )
  const outgoing = useMemo(
    () => helpRequests.filter((item) => item.requesterId === profile.id),
    [helpRequests, profile.id],
  )

  // The student who asked can rate once the request is resolved, one time only.
  function canRate(item) {
    return (
      item.status === 'resolved' &&
      item.requesterId === profile.id &&
      !helpRatings.some((rating) => rating.requestId === item.id)
    )
  }

  // Requests sorted by what the student has to do next. helpRequests is newest first.
  const groups = {
    answer: helpRequests.filter((item) => item.helperId === profile.id && item.status === 'pending'),
    chats: helpRequests.filter((item) => item.status === 'accepted'),
    rate: outgoing.filter(canRate),
    waiting: outgoing.filter((item) => item.status === 'pending'),
    past: helpRequests.filter(
      (item) => (item.status === 'resolved' || item.status === 'declined') && !canRate(item),
    ),
  }
  const needsYou = groups.answer.length + groups.rate.length

  // Subjects you said you need help with come first; any subject can be picked.
  const subjectOptions = [
    ...profile.needs,
    ...SUBJECTS.filter((item) => !profile.needs.includes(item)),
  ]

  function showTab(next) {
    setParams(next === 'requests' ? { tab: 'requests' } : {}, { replace: true })
  }

  // The latest request to that helper in this subject.
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

  // Requests sent before topics existed may have a linked question instead.
  function requestTopic(item) {
    return item.topic || questions.find((q) => q.id === item.questionId)?.body || ''
  }

  function card(item) {
    return (
      <RequestCard
        key={item.id}
        item={item}
        meId={profile.id}
        other={userById[item.helperId === profile.id ? item.requesterId : item.helperId]}
        topic={requestTopic(item)}
        canRate={canRate(item)}
        responding={respondingId === item.id}
        onRespond={respond}
      />
    )
  }

  return (
    <section>
      <h2>{isTeacher ? 'Help requests' : 'Help'}</h2>
      {isTeacher && <TeacherHelpHint subjects={profile.offers} />}
      {!isTeacher && (
        <div className="seg" role="tablist" aria-label="Help">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'find'}
            className={tab === 'find' ? 'seg-btn on' : 'seg-btn'}
            onClick={() => showTab('find')}
          >
            Find a helper
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'requests'}
            className={tab === 'requests' ? 'seg-btn on' : 'seg-btn'}
            onClick={() => showTab('requests')}
          >
            Requests
            {needsYou > 0 && <span className="count-badge">{needsYou}</span>}
          </button>
        </div>
      )}

      {tab === 'find' ? (
        <>
          <p className="hint">
            Pick a subject to see everyone who teaches it, ranked by helpful votes in
            that subject, then by how close their grade is to yours.
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
              {helpers.map(({ user, isTeacher: helperIsTeacher, score, youTeach }) => {
                const existing = latestRequest(user.id)
                // After a resolved request you can ask again; after a decline you
                // cannot, so nobody is pestered by someone who already said no.
                const canAsk = !existing || existing.status === 'resolved'
                return (
                  <article key={user.id} className="card">
                    <div className="card-head">
                      <span className="avatar">{initials(user.displayName)}</span>
                      <div>
                        <strong>
                          {user.displayName}{' '}
                          {helperIsTeacher ? (
                            <span className="badge tier-teacher">Teacher</span>
                          ) : (
                            <ReputationBadge score={score} subject={subject} />
                          )}
                          {youTeach.length > 0 && <span className="badge tier-trade">Trade</span>}
                        </strong>
                        <p className="meta">
                          {helperIsTeacher
                            ? `Verified teacher · teaches ${subject}`
                            : `Grade ${user.grade ?? '—'} · ${score} helpful ${score === 1 ? 'vote' : 'votes'} in ${subject}`}
                        </p>
                        {ratingSummary[user.id] && <HelpRating summary={ratingSummary[user.id]} />}
                      </div>
                    </div>
                    {youTeach.length > 0 && (
                      <p className="muted trade-note">
                        You can teach them back: {youTeach.join(', ')}
                      </p>
                    )}
                    {existing && (
                      <div className="sent-row">
                        <StatusPill status={existing.status} />
                        <span className="muted">
                          {existing.status === 'declined'
                            ? `${user.displayName} declined your last request.`
                            : `Topic: ${requestTopic(existing) || '—'}`}
                        </span>
                        <ChatLink request={existing} canRate={canRate(existing)} />
                      </div>
                    )}
                    {canAsk &&
                      (openFormFor === user.id ? (
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
                          className={existing ? 'react ask-again' : 'primary'}
                          onClick={() => setOpenFormFor(user.id)}
                        >
                          {existing ? 'Ask again' : 'Ask for help'}
                        </button>
                      ))}
                  </article>
                )
              })}
            </div>
          )}
        </>
      ) : helpRequests.length === 0 ? (
        <p className="empty">
          {isTeacher
            ? 'No requests yet. Students will appear here when they ask you for help.'
            : 'No requests yet. Find a helper and ask about a topic you are stuck on.'}
        </p>
      ) : (
        <>
          <RequestGroup title="Needs your answer" items={groups.answer} render={card} />
          <RequestGroup title="Open chats" items={groups.chats} render={card} />
          <RequestGroup title="Rate your helper" items={groups.rate} render={card} />
          <RequestGroup title="Waiting for an answer" items={groups.waiting} render={card} />
          {groups.past.length > 0 && (
            <>
              <button
                type="button"
                className="text-btn past-toggle"
                aria-expanded={showPast}
                onClick={() => setShowPast((value) => !value)}
              >
                {showPast ? 'Hide' : 'Show'} past requests ({groups.past.length})
              </button>
              {showPast && <div className="stack">{groups.past.map(card)}</div>}
            </>
          )}
        </>
      )}
    </section>
  )
}

function RequestGroup({ title, items, render }) {
  if (items.length === 0) return null
  return (
    <>
      <h3 className="subhead">
        {title} <span className="muted">({items.length})</span>
      </h3>
      <div className="stack">{items.map(render)}</div>
    </>
  )
}

// One request, from either side: requests sent to me have Accept / Decline.
function RequestCard({ item, meId, other, topic, canRate, responding, onRespond }) {
  const toMe = item.helperId === meId
  return (
    <article className="card request-card">
      <div className="card-head">
        <span className="avatar sm">{initials(other?.displayName)}</span>
        <div>
          <strong>{toMe ? other?.displayName || 'Student' : `To ${other?.displayName || 'Student'}`}</strong>
          <p className="meta">
            {roleLabel(other)} · {toMe ? 'asked' : 'sent'} {formatTimeAgo(item.createdAt)}
          </p>
        </div>
        <StatusPill status={item.status} forHelper={toMe} />
      </div>
      <RequestDetails subject={item.subject} topic={topic} message={item.message} />
      <ChatLink request={item} canRate={canRate} />
      {toMe && item.status === 'pending' && (
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={responding}
            onClick={() => onRespond(item.id, 'accepted')}
          >
            Accept
          </button>
          <button
            type="button"
            className="react"
            disabled={responding}
            onClick={() => onRespond(item.id, 'declined')}
          >
            Decline
          </button>
        </div>
      )}
    </article>
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

// What a teacher sees above their requests: which subjects students can ask about.
function TeacherHelpHint({ subjects }) {
  if (subjects.length === 0) {
    return (
      <p className="hint">
        Students cannot ask you for help yet.{' '}
        <Link to="/profile">Add the subjects you teach</Link> on your Profile.
      </p>
    )
  }
  return (
    <p className="hint">
      Students can ask you for help with {subjects.join(', ')}. Accept a request to open a
      chat. <Link to="/profile">Change subjects</Link>
    </p>
  )
}
