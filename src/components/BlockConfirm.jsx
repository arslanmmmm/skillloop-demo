import { useRef, useState } from 'react'
import { useAppData } from '../hooks/useAppData.js'
import { friendlyError } from '../lib/helpers.js'

// Asks before blocking, and says what blocking does and how to undo it.
export default function BlockConfirm({ user, onClose }) {
  const { blockUser, showToast } = useAppData()
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const name = user?.displayName || 'this student'

  async function handleBlock() {
    if (!user || saving.current) return
    saving.current = true
    setBusy(true)
    try {
      await blockUser(user.id, name)
      onClose()
    } catch (err) {
      showToast(friendlyError(err))
      setBusy(false)
    } finally {
      saving.current = false
    }
  }

  return (
    <div className="safety-panel block-confirm" role="alert">
      <p className="safety-title">Block {name}?</p>
      <p className="muted safety-hint">
        You will not see their explanations, and neither of you can send the other help
        requests or chat messages. They are not told. You can unblock them on your Profile.
      </p>
      <div className="form-actions">
        <button type="button" className="text-btn cancel" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="primary danger" onClick={handleBlock} disabled={busy}>
          {busy ? 'Blocking…' : 'Block'}
        </button>
      </div>
    </div>
  )
}
