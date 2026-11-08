import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ExplanationForm from '../components/ExplanationForm.jsx'
import { SUBJECTS } from '../config/subjects.js'
import { useAuth } from '../hooks/useAuth.js'
import { useAppData } from '../hooks/useAppData.js'
import { friendlyError } from '../lib/helpers.js'

// /write publishes a new explanation; /write?edit=<id> edits one of mine.
export default function WritePage() {
  const [params] = useSearchParams()
  const editId = params.get('edit')
  return editId ? <EditPost key={editId} id={editId} /> : <NewPost />
}

function NewPost() {
  const { profile } = useAuth()
  const { addExplanation, showToast } = useAppData()
  const navigate = useNavigate()

  async function publish(values) {
    await addExplanation(values)
    showToast('Posted. Votes from others will raise your reputation.')
    navigate('/feed')
  }

  return (
    <section>
      <h2>Write an explanation</h2>
      <p className="hint">
        Posted as {profile.displayName}. After it is on the feed, a helpful vote from
        someone else raises your reputation in that subject.
      </p>
      <ExplanationForm
        initial={{ subject: profile.offers[0] || SUBJECTS[0], title: '', text: '' }}
        submitLabel="Publish to the board"
        busyLabel="Publishing…"
        onSubmit={publish}
      />
    </section>
  )
}

function EditPost({ id }) {
  const { profile } = useAuth()
  const { explanations, loadExplanationsByIds, updateExplanation, showToast } = useAppData()
  const navigate = useNavigate()
  const post = explanations.find((item) => item.id === id)
  const [loadError, setLoadError] = useState('')
  const [lookedUp, setLookedUp] = useState(false)

  // Opened from a link or after a reload: load the post first.
  useEffect(() => {
    if (post || lookedUp) return undefined
    let alive = true
    loadExplanationsByIds([id])
      .catch((err) => alive && setLoadError(friendlyError(err)))
      .finally(() => alive && setLookedUp(true))
    return () => {
      alive = false
    }
  }, [id, post, lookedUp, loadExplanationsByIds])

  async function save(values) {
    const saved = await updateExplanation(id, values)
    showToast(
      saved.reviewStatus === 'needs_correction'
        ? 'Saved. Your teacher can now check your correction.'
        : 'Your changes are saved.',
    )
    navigate('/profile')
  }

  if (!post) {
    return (
      <section>
        <h2>Edit explanation</h2>
        <p className={lookedUp ? 'empty' : 'hint'}>
          {loadError || (lookedUp ? 'This post was not found.' : 'Loading…')}
        </p>
      </section>
    )
  }

  if (post.authorId !== profile.id) {
    return (
      <section>
        <h2>Edit explanation</h2>
        <p className="empty">You can only edit your own posts.</p>
      </section>
    )
  }

  if (post.reviewStatus === 'hidden') {
    return (
      <section>
        <h2>Edit explanation</h2>
        <p className="empty">
          A teacher hid this post, so it cannot be edited. Ask your teacher what to change.
        </p>
        <Link to="/profile" className="react link-btn">
          Back to Profile
        </Link>
      </section>
    )
  }

  return (
    <section>
      <h2>Edit explanation</h2>
      {post.reviewStatus === 'needs_correction' && post.teacherNote && (
        <div className="review-box warn" role="note">
          <strong>⚠ Your teacher asked for a correction</strong>
          <p>{post.teacherNote}</p>
        </div>
      )}
      <ExplanationForm
        initial={{ subject: post.subject, title: post.title, text: post.text }}
        subjectLocked
        submitLabel="Save changes"
        busyLabel="Saving…"
        onSubmit={save}
      >
        <p className="hint tight edit-note">
          The subject cannot change. Saving resets this post’s helpful votes, because they
          were for the old version
          {post.reviewStatus === 'verified' ? ', and a teacher will need to verify it again' : ''}.
        </p>
      </ExplanationForm>
      <button type="button" className="text-btn" onClick={() => navigate('/profile')}>
        Cancel
      </button>
    </section>
  )
}
