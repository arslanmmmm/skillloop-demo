import { useMemo, useState } from 'react'
import { FeedSkeleton } from '../components/FeedCard.jsx'
import { reputationLabel } from '../config/reputation.js'
import { SUBJECTS } from '../config/subjects.js'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { initials } from '../lib/helpers.js'

export default function MatchesPage() {
  const { profile } = useAuth()
  const {
    matches,
    questions,
    helpRequests,
    userById,
    loading,
    error,
    addQuestion,
    sendHelpRequest,
    respondToHelpRequest,
    reputation,
    showToast,
  } = useAppData()

  const [subject, setSubject] = useState(profile.needs[0] || SUBJECTS[0])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [lastQuestionId, setLastQuestionId] = useState(null)
  const [sendingId, setSendingId] = useState('')

  const incoming = useMemo(
    () => helpRequests.filter((item) => item.helperId === profile.id),
    [helpRequests, profile.id],
  )
  const outgoing = useMemo(
    () => helpRequests.filter((item) => item.requesterId === profile.id),
    [helpRequests, profile.id],
  )
  const myQuestions = useMemo(
    () => questions.filter((item) => item.authorId === profile.id).slice(0, 5),
    [questions, profile.id],
  )

  async function submitQuestion(event) {
    event.preventDefault()
    const body = question.trim()
    if (!body) {
      setFormError('Write the question you need help with.')
      return
    }
    setFormError('')
    setBusy(true)
    try {
      const saved = await addQuestion({ subject, body })
      setLastQuestionId(saved.id)
      setQuestion('')
      showToast('Question posted. Send a request to a suggested helper below.')
    } catch (err) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function requestHelp(match) {
    const top = [...match.theyTeach].sort((a, b) => b.score - a.score)[0]
    if (!top) return
    setSendingId(match.user.id)
    try {
      await sendHelpRequest({
        helperId: match.user.id,
        subject: top.subject,
        questionId: lastQuestionId,
        helperName: match.user.displayName,
      })
    } catch (err) {
      showToast(err.message || 'Could not send request')
    } finally {
      setSendingId('')
    }
  }

  function requestStatus(helperId, subjectName) {
    return outgoing.find(
      (item) => item.helperId === helperId && item.subject === subjectName,
    )
  }

  async function respond(requestId, status) {
    try {
      await respondToHelpRequest(requestId, status)
    } catch (err) {
      showToast(err.message || 'Could not update request')
    }
  }

  return (
    <section>
      <h2>Ask for help</h2>
      <p className="hint">
        Post a question, then send a request to a classmate who can teach that
        subject. Matches still need a two-way trade (they teach what you need,
        you teach what they need). Ranked by their votes, then closer / higher
        grade.
      </p>

      <form className="card form" onSubmit={submitQuestion}>
        <label>
          Subject
          <select value={subject} onChange={(event) => setSubject(event.target.value)}>
            {(profile.needs.length ? profile.needs : SUBJECTS).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Question
          <textarea
            rows={3}
            maxLength={1000}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What are you stuck on?"
          />
        </label>
        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Posting…' : 'Post question'}
        </button>
      </form>

      {incoming.length > 0 && (
        <>
          <h3 className="subhead">Incoming requests</h3>
          <div className="stack">
            {incoming.map((item) => {
              const who = userById[item.requesterId]
              const linked = questions.find((q) => q.id === item.questionId)
              return (
                <article key={item.id} className="card">
                  <p className="meta">
                    {who?.displayName || 'Student'} · Grade {who?.grade ?? '—'} · {item.subject}{' '}
                    · {item.status}
                  </p>
                  {linked && <p>{linked.body}</p>}
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

      {myQuestions.length > 0 && (
        <>
          <h3 className="subhead">Your recent questions</h3>
          <div className="stack">
            {myQuestions.map((item) => (
              <article key={item.id} className="card">
                <p className="meta">{item.subject}</p>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </>
      )}

      <h3 className="subhead">Suggested helpers</h3>
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
            const top = [...match.theyTeach].sort((a, b) => b.score - a.score)[0]
            const existing = top ? requestStatus(match.user.id, top.subject) : null
            const label = reputationLabel(top?.score ?? 0)
            return (
              <article key={match.user.id} className="card">
                <div className="card-head">
                  <span className="avatar">{initials(match.user.displayName)}</span>
                  <div>
                    <strong>
                      {match.user.displayName} <span className="badge">{label}</span>
                    </strong>
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
                  disabled={Boolean(existing) || sendingId === match.user.id}
                  onClick={() => requestHelp(match)}
                >
                  {existing
                    ? existing.status === 'pending'
                      ? 'Request sent'
                      : existing.status === 'accepted'
                        ? 'Accepted'
                        : 'Declined'
                    : sendingId === match.user.id
                      ? 'Sending…'
                      : 'Send request'}
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
