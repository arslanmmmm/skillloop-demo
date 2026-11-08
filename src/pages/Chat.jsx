import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { supabase } from '../lib/supabaseClient.js'
import { formatTimeAgo, friendlyError, initials, mapMessage } from '../lib/helpers.js'

const MESSAGE_MAX = 1000

export default function ChatPage() {
  const { requestId } = useParams()
  const { profile } = useAuth()
  const { helpRequests, userById, loading } = useAppData()
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

      {request.status === 'accepted' ? (
        // Keyed by request so its messages and draft reset when the chat changes.
        <ChatThread key={request.id} request={request} meId={profile.id} userById={userById} />
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

function BackLink() {
  return (
    <Link to="/matches" className="back-link">
      ← Back to Help
    </Link>
  )
}

function ChatThread({ request, meId, userById }) {
  const [messages, setMessages] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState('')
  // Mirrors `draft` so two taps in the same instant cannot send the same text twice.
  const draftRef = useRef('')
  const inputRef = useRef(null)
  const tempCount = useRef(0)
  const endRef = useRef(null)

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

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

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
          <p className="muted chat-empty">No messages yet. Say hi and explain where you are stuck.</p>
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
        <div ref={endRef} />
      </div>
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
    </>
  )
}
