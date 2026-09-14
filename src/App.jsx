import { useMemo, useState } from 'react'
import './App.css'

const CURRENT_USER_ID = 1

const SUBJECTS = ['Chemistry', 'History', 'Math', 'Physics']

const INITIAL_USERS = [
  { id: 1, name: 'Aigerim', offers: ['Chemistry'], needs: ['History'] },
  { id: 2, name: 'Bekzat', offers: ['History', 'Math'], needs: ['Chemistry'] },
  { id: 3, name: 'Dana', offers: ['Physics'], needs: ['Chemistry', 'Math'] },
  { id: 4, name: 'Mira', offers: ['History'], needs: ['Chemistry'] },
  { id: 5, name: 'Yerzhan', offers: ['History', 'Physics'], needs: ['Chemistry'] },
]

const INITIAL_EXPLANATIONS = [
  {
    id: 1,
    authorId: 1,
    subject: 'Chemistry',
    title: 'Balancing equations, explained simply',
    text: 'An equation is a recipe. If you use 2 eggs on the left, you need 2 eggs on the right. Atoms are the ingredients — count them on both sides until they match.',
    upvotes: 4,
  },
  {
    id: 2,
    authorId: 2,
    subject: 'History',
    title: 'The Silk Road in one analogy',
    text: 'Think of it as an ancient group chat that also delivered packages. Ideas, silk, and spices moved because people wanted things they could not make at home.',
    upvotes: 6,
  },
  {
    id: 3,
    authorId: 2,
    subject: 'Math',
    title: 'Why we flip the second fraction',
    text: 'Dividing by a fraction asks “how many of these fit into that?” Flipping turns the question into multiplication, which is just repeated adding.',
    upvotes: 3,
  },
  {
    id: 4,
    authorId: 4,
    subject: 'History',
    title: 'Why empires fall — ELI5',
    text: 'A huge empire is like a too-big backpack. The farther it stretches, the heavier it gets to carry: money, distance, and unhappy people all add weight.',
    upvotes: 2,
  },
  {
    id: 5,
    authorId: 5,
    subject: 'History',
    title: 'What a “revolution” actually means',
    text: 'Not just a fight. It is when the rules of who gets to decide get rewritten — like swapping the captain of a ship mid-voyage because the crew wants a new course.',
    upvotes: 5,
  },
  {
    id: 6,
    authorId: 3,
    subject: 'Physics',
    title: 'Inertia without the jargon',
    text: 'Things like staying as they are. A rolling ball keeps rolling until something (friction, a wall, your foot) bothers it. That stubbornness is inertia.',
    upvotes: 3,
  },
]

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function reputationFor(explanations, userId, subject) {
  return explanations
    .filter((item) => item.authorId === userId && item.subject === subject)
    .reduce((sum, item) => sum + item.upvotes, 0)
}

function findMatches(users, explanations, me) {
  return users
    .filter((other) => other.id !== me.id)
    .map((other) => {
      const theyTeachWhatINeed = other.offers.filter((subject) =>
        me.needs.includes(subject),
      )
      const iTeachWhatTheyNeed = me.offers.filter((subject) =>
        other.needs.includes(subject),
      )
      if (!theyTeachWhatINeed.length || !iTeachWhatTheyNeed.length) return null
      return {
        user: other,
        theyTeach: theyTeachWhatINeed.map((subject) => ({
          subject,
          score: reputationFor(explanations, other.id, subject),
        })),
        youTeach: iTeachWhatTheyNeed,
      }
    })
    .filter(Boolean)
}

const TABS = [
  { id: 'feed', label: 'Explanation feed' },
  { id: 'profile', label: 'My profile' },
  { id: 'matches', label: 'Match suggestions' },
  { id: 'write', label: 'New explanation' },
]

export default function App() {
  const [users] = useState(INITIAL_USERS)
  const [explanations, setExplanations] = useState(INITIAL_EXPLANATIONS)
  const [tab, setTab] = useState('feed')
  const [toast, setToast] = useState('')
  const [requestedIds, setRequestedIds] = useState([])
  const [subject, setSubject] = useState(SUBJECTS[0])
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')

  const me = users.find((user) => user.id === CURRENT_USER_ID)
  const userById = useMemo(
    () => Object.fromEntries(users.map((user) => [user.id, user])),
    [users],
  )

  const matches = useMemo(
    () => findMatches(users, explanations, me),
    [users, explanations, me],
  )

  const myExplanations = explanations.filter((item) => item.authorId === me.id)

  function showToast(message) {
    setToast(message)
    window.clearTimeout(showToast._t)
    showToast._t = window.setTimeout(() => setToast(''), 2800)
  }

  function upvote(id) {
    setExplanations((list) =>
      list.map((item) =>
        item.id === id ? { ...item, upvotes: item.upvotes + 1 } : item,
      ),
    )
  }

  function requestTrade(userId, name) {
    setRequestedIds((ids) => (ids.includes(userId) ? ids : [...ids, userId]))
    showToast(`Trade request sent to ${name}. They’ll see it in a full version.`)
  }

  function submitExplanation(event) {
    event.preventDefault()
    const nextTitle = title.trim()
    const nextText = text.trim()
    if (!nextTitle || !nextText) return
    setExplanations((list) => [
      {
        id: Math.max(0, ...list.map((item) => item.id)) + 1,
        authorId: me.id,
        subject,
        title: nextTitle,
        text: nextText,
        upvotes: 0,
      },
      ...list,
    ])
    setTitle('')
    setText('')
    setTab('feed')
    showToast('Posted. Upvotes on this explanation will raise your reputation.')
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="eyebrow">SkillLoop demo</p>
          <h1>Trade skills. Earn trust by explaining.</h1>
          <p className="lede">
            Reputation is not a self-score. It is the sum of upvotes on a
            student’s ELI5 explanations in that subject. Upvote in the feed,
            then check Matches — the number moves.
          </p>
        </div>
        <div className="you">
          <span className="avatar">{initials(me.name)}</span>
          <div>
            <strong>Signed in as {me.name}</strong>
            <p>
              Can teach {me.offers.join(', ')} · Needs help with{' '}
              {me.needs.join(', ')}
            </p>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Demo screens">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'tab on' : 'tab'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'feed' && (
        <section>
          <h2>ELI5 explanation board</h2>
          <p className="hint">
            Each upvote is a vote for clarity. It immediately adds 1 to the
            author’s reputation in that subject.
          </p>
          <div className="stack">
            {explanations.map((item) => {
              const author = userById[item.authorId]
              const score = reputationFor(
                explanations,
                item.authorId,
                item.subject,
              )
              return (
                <article key={item.id} className="card">
                  <div className="card-head">
                    <span className="avatar sm">{initials(author.name)}</span>
                    <div>
                      <strong>{author.name}</strong>
                      <p className="meta">
                        {item.subject} · reputation in {item.subject}: {score}
                      </p>
                    </div>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                  <button
                    type="button"
                    className="upvote"
                    onClick={() => upvote(item.id)}
                  >
                    ▲ Helpful · {item.upvotes}
                  </button>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {tab === 'profile' && (
        <section>
          <h2>{me.name}</h2>
          <div className="profile-grid">
            <div className="card">
              <h3>Can teach</h3>
              <p className="hint">Score = upvotes on their explanations.</p>
              <ul className="plain">
                {me.offers.map((subj) => (
                  <li key={subj}>
                    <span>{subj}</span>
                    <strong className="score">
                      {reputationFor(explanations, me.id, subj)}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h3>Needs help with</h3>
              <p className="hint">No score — this is a request, not a claim.</p>
              <ul className="plain">
                {me.needs.map((subj) => (
                  <li key={subj}>
                    <span>{subj}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <h3 className="subhead">Explanations by {me.name}</h3>
          <div className="stack">
            {myExplanations.length === 0 && (
              <p className="hint">None yet — write one on the last tab.</p>
            )}
            {myExplanations.map((item) => (
              <article key={item.id} className="card">
                <p className="meta">
                  {item.subject} · {item.upvotes} upvotes
                </p>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'matches' && (
        <section>
          <h2>Suggested trades</h2>
          <p className="hint">
            Partners who can teach what {me.name} needs, and need what{' '}
            {me.name} can teach. Reputation is computed from the feed — not
            typed in.
          </p>
          <div className="stack">
            {matches.map((match) => {
              const sent = requestedIds.includes(match.user.id)
              return (
                <article key={match.user.id} className="card">
                  <div className="card-head">
                    <span className="avatar">{initials(match.user.name)}</span>
                    <div>
                      <strong>{match.user.name}</strong>
                      <p className="meta">Complementary offer / need</p>
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
                          your score:{' '}
                          {reputationFor(explanations, me.id, subj)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="primary"
                    disabled={sent}
                    onClick={() => requestTrade(match.user.id, match.user.name)}
                  >
                    {sent ? 'Request sent' : 'Request trade'}
                  </button>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {tab === 'write' && (
        <section>
          <h2>Write an ELI5 explanation</h2>
          <p className="hint">
            Posted as {me.name}, starting at 0 upvotes. After you publish,
            upvote it in the feed and watch your {me.offers[0]} reputation
            rise on Profile and Matches.
          </p>
          <form className="card form" onSubmit={submitExplanation}>
            <label>
              Subject
              <select
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              >
                {SUBJECTS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Balancing equations, explained simply"
              />
            </label>
            <label>
              Explanation
              <textarea
                rows={5}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Explain it like the reader is 11 years old."
              />
            </label>
            <button type="submit" className="primary">
              Publish to the board
            </button>
          </form>
        </section>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
