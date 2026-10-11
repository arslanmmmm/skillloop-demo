import { useMemo, useState } from 'react'
import { FeedSkeleton } from '../components/FeedCard.jsx'
import { reputationLabel } from '../config/reputation.js'
import { SUBJECTS } from '../config/subjects.js'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { findHelpers, formatPostedAt, initials } from '../lib/helpers.js'

const STATUS_TEXT = {
  pending: 'Waiting for an answer',
  accepted: 'Accepted',
  declined: 'Declined',
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
    addQuestion,
    sendHelpRequest,
    respondToHelpRequest,
    showToast,
  } = useAppData()

  const [subject, setSubject] = useState(profile.needs[0] || SUBJECTS[0])
  const [question, setQuestion] = useState('')
  // The last question saved, so sending it to several helpers stores it once.
  const [posted, setPosted] = useState(null)
  const [sendingId, setSendingId] = useState('')

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

  async function requestHelp(helper) {
    setSendingId(helper.id)
    try {
      const body = question.trim()
      let questionId = null
      if (body) {
        if (posted?.subject === subject && posted.body === body) {
          questionId = posted.id
        } else {
          const saved = await addQuestion({ subject, body })
          setPosted({ id: saved.id, subject, body })
          questionId = saved.id
        }
      }
      await sendHelpRequest({
        helperId: helper.id,
        subject,
        questionId,
        helperName: helper.displayName,
      })
    } catch (err) {
      showToast(err.message || 'Could not send request')
    } finally {
      setSendingId('')
    }
  }

  // helpRequests is newest first, so this is the latest request to that helper.
  function latestRequest(helperId) {
    return outgoing.find(
      (item) => item.helperId === helperId && item.subject === subject,
    )
  }

  async function respond(requestId, status) {
    try {
      await respondToHelpRequest(requestId, status)
    } catch (err) {
      showToast(err.message || 'Could not update request')
    }
  }

  function questionText(questionId) {
    return questions.find((item) => item.id === questionId)?.body
  }

  return (
    <section>
      <h2>Ask for help</h2>
      <p className="hint">
        Pick a subject to see everyone who teaches it, ranked by helpful votes in
        that subject, then by how close their grade is to yours. Add your
        question so the helper knows what you are stuck on.
      </p>

      <div className="card form">
        <label>
          Subject
          <select value={subject} onChange={(event) => setSubject(event.target.value)}>
            {subjectOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Your question (optional)
          <textarea
            rows={3}
            maxLength={1000}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What are you stuck on?"
          />
        </label>
      </div>

      {incoming.length > 0 && (
        <>
          <h3 className="subhead">Requests for you</h3>
          <div className="stack">
            {incoming.map((item) => {
              const who = userById[item.requesterId]
              const linked = questionText(item.questionId)
              return (
                <article key={item.id} className="card">
                  <p className="meta">
                    {who?.displayName || 'Student'} · Grade {who?.grade ?? '—'} ·{' '}
                    {item.subject} · {formatPostedAt(item.createdAt)}
                  </p>
                  {linked && <p>{linked}</p>}
                  {item.status === 'pending' ? (
                    <div className="actions">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => respond(item.id, 'accepted')}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="react"
                        onClick={() => respond(item.id, 'declined')}
                      >
                        Decline
                      </button>
                    </div>
                  ) : (
                    <p className="muted">You {item.status} this request.</p>
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
            const sending = sendingId === user.id
            return (
              <article key={user.id} className="card">
                <div className="card-head">
                  <span className="avatar">{initials(user.displayName)}</span>
                  <div>
                    <strong>
                      {user.displayName}{' '}
                      <span className="badge">{reputationLabel(score)}</span>
                      {youTeach.length > 0 && <span className="badge">Trade</span>}
                    </strong>
                    <p className="meta">
                      Grade {user.grade ?? '—'} · {score} helpful{' '}
                      {score === 1 ? 'vote' : 'votes'} in {subject}
                    </p>
                  </div>
                </div>
                {youTeach.length > 0 && (
                  <p className="muted">
                    You can teach them back: {youTeach.join(', ')}
                  </p>
                )}
                <button
                  type="button"
                  className="primary"
                  disabled={Boolean(existing) || sending}
                  onClick={() => requestHelp(user)}
                >
                  {sending
                    ? 'Sending…'
                    : existing
                      ? existing.status === 'pending'
                        ? 'Request sent'
                        : STATUS_TEXT[existing.status]
                      : 'Send request'}
                </button>
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
              const linked = questionText(item.questionId)
              return (
                <article key={item.id} className="card">
                  <p className="meta">
                    To {helper?.displayName || 'Student'} · {item.subject} ·{' '}
                    {formatPostedAt(item.createdAt)}
                  </p>
                  {linked && <p>{linked}</p>}
                  <p className={item.status === 'accepted' ? '' : 'muted'}>
                    <strong>{STATUS_TEXT[item.status]}</strong>
                  </p>
                </article>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
