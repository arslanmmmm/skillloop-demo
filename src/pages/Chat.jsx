import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { supabase } from '../lib/supabaseClient.js'
import { formatTimeAgo, friendlyError, initials, mapMessage } from '../lib/helpers.js'

const MESSAGE_MAX = 1000
const COMMENT_MAX = 300
const HELP_WORDS = ['', 'Not helpful', 'A little helpful', 'Helpful', 'Very helpful', 'Extremely helpful']

export default function ChatPage() {
  const { requestId } = useParams()
  const { profile } = useAuth()
  const { helpRequests, userById, loading, helpRatings } = useAppData()
  const request = helpRequests.find((item) => item.id === requestId)

  if (loading) {
    return <p className="hint">Loading chat…</p>
  }

  if (!request) {
    return (
      <section>
        <BackLink />
        <p className="empty">This chat does not exist, or you are not part of it.</p>
      </section>
    )
  }

  const isHelper = request.helperId === profile.id
  const other = userById[isHelper ? request.requesterId : request.helperId]
  const otherName = other?.displayName || 'Student'

  return (
    <section className="chat">
      <BackLink />
      <div className="card chat-head">
        <span className="avatar sm">{initials(otherName)}</span>
        <div>
          <strong>{otherName}</strong>
          <p className="meta">
            Grade {other?.grade ?? '—'} · {isHelper ? 'asked you for help' : 'is helping you'}
          </p>
        </div>
        <p className="chat-topic">
          <span className="badge">{request.subject}</span> {request.topic || 'No topic'}
        </p>
      </div>

      {request.status === 'accepted' && <ResolveControl request={request} />}

      {request.status === 'resolved' && (
        <ResolvedPanel
          request={request}
          isHelper={isHelper}
          otherName={otherName}
          resolvedByName={
            request.resolvedBy === profile.id ? 'You' : userById[request.resolvedBy]?.displayName
          }
          rating={helpRatings.find((item) => item.requestId === request.id)}
        />
      )}

      {request.status === 'accepted' || request.status === 'resolved' ? (
        // Keyed by request so its messages and draft reset when the chat changes.
        <ChatThread
          key={request.id}
          request={request}
          meId={profile.id}
          userById={userById}
          readOnly={request.status === 'resolved'}
        />
      ) : (
        <p className="empty">
          {request.status === 'pending'
            ? isHelper
              ? 'Accept this request on the Help page to start chatting.'
              : `The chat opens when ${otherName} accepts your request.`
            : 'This request was declined, so there is no chat.'}
        </p>
      )}
    </section>
  )
}

// Either student can close the chat once the question is answered.
function ResolveControl({ request }) {
  const { respondToHelpRequest, showToast } = useAppData()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)

  async function resolve() {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    try {
      await respondToHelpRequest(request.id, 'resolved')
    } catch (err) {
      showToast(friendlyError(err))
      setBusy(false)
      setAsking(false)
    } finally {
      saving.current = false
    }
  }

  if (!asking) {
    return (
      <div className="resolve-bar">
        <span className="muted">Question answered?</span>
        <button type="button" className="react" onClick={() => setAsking(true)}>
          Mark as resolved
        </button>
      </div>
    )
  }

  return (
    <div className="resolve-bar confirm" role="alert">
      <span>Mark as resolved? The chat will become read-only for both of you.</span>
      <button type="button" className="text-btn cancel" onClick={() => setAsking(false)} disabled={busy}>
        Cancel
      </button>
      <button type="button" className="primary" onClick={resolve} disabled={busy}>
        {busy ? 'Saving…' : 'Yes, resolve'}
      </button>
    </div>
  )
}

function ResolvedPanel({ request, isHelper, otherName, resolvedByName, rating }) {
  return (
    <div className="card resolved-panel">
      <p className="resolved-title">
        <span className="status-pill status-resolved">Resolved</span>
        <span className="muted">
          {resolvedByName ? `${resolvedByName} marked this as resolved` : 'Marked as resolved'}
          {request.resolvedAt ? ` · ${formatTimeAgo(request.resolvedAt)}` : ''}. The chat is read-only.
        </span>
      </p>
      {rating ? (
        <p className="rating-result">
          <Stars value={rating.rating} />
          <span>
            {isHelper ? `${otherName} rated your help` : 'You rated this help'}:{' '}
            <strong>{HELP_WORDS[rating.rating]}</strong>
          </span>
          {rating.comment && <q className="rating-comment">{rating.comment}</q>}
        </p>
      ) : isHelper ? (
        <p className="muted">{otherName} can now rate how helpful you were.</p>
      ) : (
        <RateHelpForm request={request} helperName={otherName} />
      )}
    </div>
  )
}

function RateHelpForm({ request, helperName }) {
  const { addHelpRating, showToast } = useAppData()
  // No default: a pre-selected rating nudges students toward that score.
  const [rating, setRating] = useState(null)
  const [hover, setHover] = useState(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const shown = hover ?? rating

  async function submit(event) {
    event.preventDefault()
    if (!rating || saving.current) return
    saving.current = true
    setBusy(true)
    try {
      await addHelpRating({
        requestId: request.id,
        helperId: request.helperId,
        rating,
        comment: comment.trim() || null,
      })
    } catch (err) {
      showToast(friendlyError(err))
      setBusy(false)
    } finally {
      saving.current = false
    }
  }

  return (
    <form className="rate-help form" onSubmit={submit}>
      <p className="rate-label">How helpful was {helperName}?</p>
      <div className="rate-row">
        <div
          className="star-picker"
          role="radiogroup"
          aria-label="Help rating"
          onMouseLeave={() => setHover(null)}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className={shown && value <= shown ? 'star-pick on' : 'star-pick'}
              onMouseEnter={() => setHover(value)}
              title={HELP_WORDS[value]}
            >
              <input
                type="radio"
                name={`help-${request.id}`}
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
              />
              ★
            </label>
          ))}
        </div>
        <span className="rate-word">{shown ? HELP_WORDS[shown] : 'Tap a star'}</span>
      </div>
      <label>
        Comment (optional)
        <textarea
          rows={2}
          maxLength={COMMENT_MAX}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="What helped most?"
        />
      </label>
      <button type="submit" className="primary" disabled={busy || !rating}>
        {busy ? 'Saving…' : rating ? 'Send rating' : 'Pick a rating'}
      </button>
    </form>
  )
}

function Stars({ value }) {
  return (
    <span className="stars" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? 'star on' : 'star'} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  )
}

function BackLink() {
  return (
    <Link to="/matches" className="back-link">
      ← Back to Help
    </Link>
  )
}

function ChatThread({ request, meId, userById, readOnly }) {
  const [messages, setMessages] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState('')
  // Mirrors `draft` so two taps in the same instant cannot send the same text twice.
  const draftRef = useRef('')
  const inputRef = useRef(null)
  const tempCount = useRef(0)
  const firstScroll = useRef(true)

  function changeDraft(value) {
    draftRef.current = value
    setDraft(value)
  }

  // Adds messages from the first load, our own sends and Realtime, without duplicates.
  function addMessages(rows) {
    setMessages((list) => {
      const byId = new Map(list.map((item) => [item.id, item]))
      for (const row of rows) byId.set(row.id, row)
      return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    })
  }

  useEffect(() => {
    let alive = true
    supabase
      .from('messages')
      .select('*')
      .eq('request_id', request.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) setLoadError(friendlyError(error))
        else addMessages((data ?? []).map(mapMessage))
        setLoaded(true)
      })

    // New messages from the other student arrive live; RLS still applies.
    const channel = supabase
      .channel(`chat-${request.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `request_id=eq.${request.id}`,
        },
        (payload) => addMessages([mapMessage(payload.new)]),
      )
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(channel)
    }
  }, [request.id])

  // Show the newest message: always on first load and after sending, but only
  // when the student is already near the bottom for incoming messages, so the
  // page does not jump while they read older ones.
  useEffect(() => {
    if (messages.length === 0) return
    const page = document.documentElement
    const fromBottom = page.scrollHeight - (window.scrollY + window.innerHeight)
    const mineLast = messages[messages.length - 1].senderId === meId
    if (firstScroll.current || mineLast || fromBottom < 250) {
      firstScroll.current = false
      window.scrollTo({ top: page.scrollHeight })
    }
  }, [messages, meId])

  // Works like a messaging app: the box empties at once, the message shows
  // straight away (faded until saved), and the keyboard stays open so the next
  // message can be typed and sent without waiting.
  async function send(event) {
    event?.preventDefault()
    // Refocus inside the tap itself; iPhone only keeps the keyboard open then.
    inputRef.current?.focus()
    const body = draftRef.current.trim()
    if (!body) return
    changeDraft('')
    setSendError('')
    tempCount.current += 1
    const tempId = `sending-${tempCount.current}`
    addMessages([
      { id: tempId, requestId: request.id, senderId: meId, body, createdAt: new Date().toISOString(), pending: true },
    ])
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({ request_id: request.id, sender_id: meId, body })
        .select('*')
        .single()
      if (error) throw error
      setMessages((list) => list.filter((item) => item.id !== tempId))
      addMessages([mapMessage(data)])
    } catch (err) {
      setMessages((list) => list.filter((item) => item.id !== tempId))
      setSendError(friendlyError(err))
      // Give the text back, unless the student already started a new message.
      if (!draftRef.current) changeDraft(body)
    }
  }

  // Enter sends, Shift+Enter starts a new line (not while typing with an IME).
  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }

  return (
    <>
      <p className="chat-safety">
        Keep the chat about schoolwork. Never share your phone number, address or passwords.
      </p>
      <div className="chat-log" aria-live="polite">
        {!loaded ? (
          <p className="muted">Loading messages…</p>
        ) : loadError ? (
          <p className="form-error">{loadError}</p>
        ) : messages.length === 0 ? (
          <p className="muted chat-empty">
            {readOnly
              ? 'No messages were sent in this chat.'
              : 'No messages yet. Say hi and explain where you are stuck.'}
          </p>
        ) : (
          messages.map((item) => {
            const mine = item.senderId === meId
            return (
              <div
                key={item.id}
                className={`msg${mine ? ' mine' : ''}${item.pending ? ' pending' : ''}`}
              >
                {!mine && (
                  <span className="msg-name">{userById[item.senderId]?.displayName || 'Student'}</span>
                )}
                {/* Plain text on purpose: links are shown, never clickable. */}
                <p className="msg-text">{item.body}</p>
                <span className="msg-time">
                  {item.pending ? 'Sending…' : formatTimeAgo(item.createdAt)}
                </span>
              </div>
            )
          })
        )}
      </div>
      {readOnly ? null : (
        <form className="chat-composer" onSubmit={send}>
          <textarea
            ref={inputRef}
            rows={2}
            maxLength={MESSAGE_MAX}
            value={draft}
            onChange={(event) => changeDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Write a message…"
            aria-label="Message"
          />
          {/* preventDefault on press keeps focus (and the keyboard) in the text box. */}
          <button
            type="submit"
            className="primary"
            disabled={!draft.trim()}
            onMouseDown={(event) => event.preventDefault()}
          >
            Send
          </button>
          {(sendError || draft.length > MESSAGE_MAX - 100) && (
            <p className={sendError ? 'form-error chat-note' : 'muted chat-note'}>
              {sendError || `${draft.length}/${MESSAGE_MAX}`}
            </p>
          )}
        </form>
      )}
    </>
  )
}
