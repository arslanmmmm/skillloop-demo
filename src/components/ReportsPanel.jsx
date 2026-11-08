import { useEffect, useRef, useState } from 'react'
import { REPORT_REASONS } from '../config/reports.js'
import { useAppData } from '../hooks/useAppData.js'
import { formatTimeAgo, friendlyError } from '../lib/helpers.js'

// Teacher-only list of open reports, newest first. Reported chat messages are
// read from the copy saved in the report; teachers cannot read chats.
export default function ReportsPanel() {
  const { fetchOpenReports } = useAppData()
  const [reports, setReports] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  // Changing the key reloads the list (Retry button).
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    fetchOpenReports()
      .then((rows) => {
        if (!alive) return
        setReports(rows)
        setLoadError('')
      })
      .catch((err) => {
        if (alive) setLoadError(friendlyError(err))
      })
      .finally(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [fetchOpenReports, reloadKey])

  if (!loaded) return <p className="hint">Loading reports…</p>
  if (loadError) {
    return (
      <div className="empty">
        <p>{loadError}</p>
        <button
          type="button"
          className="react"
          onClick={() => {
            setLoadError('')
            setLoaded(false)
            setReloadKey((n) => n + 1)
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      <p className="hint">
        Reports from students, newest first. The reported student never sees who reported
        them. Mark a report handled once you have dealt with it.
      </p>
      <h3 className="subhead">
        {reports.length} open {reports.length === 1 ? 'report' : 'reports'}
      </h3>
      {reports.length === 0 ? (
        <p className="empty">No open reports. Nice.</p>
      ) : (
        <div className="stack">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onHandled={() => setReports((list) => list.filter((item) => item.id !== report.id))}
            />
          ))}
        </div>
      )}
    </>
  )
}

function ReportCard({ report, onHandled }) {
  const { userById, explanations, reviewExplanation, setReportStatus, showToast } = useAppData()
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const reported = userById[report.reportedUserId]
  const reporter = userById[report.reporterId]
  const post = report.explanationId
    ? explanations.find((item) => item.id === report.explanationId)
    : null
  const isMessage = report.targetType === 'message'

  async function run(action, doneText) {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    try {
      await action()
      showToast(doneText)
      return true
    } catch (err) {
      showToast(friendlyError(err))
      return false
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  async function handleHide() {
    await run(() => reviewExplanation(post.id, 'hidden'), 'Hidden from students.')
  }

  async function handleMarkHandled() {
    const ok = await run(() => setReportStatus(report.id, 'handled'), 'Report marked as handled.')
    if (ok) onHandled()
  }

  return (
    <article className="card report-card">
      <div className="review-head">
        <p className="meta">
          {isMessage ? 'Chat message' : 'Explanation'} · {formatTimeAgo(report.createdAt)}
        </p>
        <span className="status-pill report-reason">{REPORT_REASONS[report.reason]}</span>
      </div>
      <p className="report-people">
        Reported student: <strong>{reported?.displayName || 'Deleted account'}</strong>
        {reported?.grade ? ` · Grade ${reported.grade}` : ''}
        <br />
        <span className="muted">Reported by {reporter?.displayName || 'a student'}</span>
      </p>
      {report.details && <q className="report-details">{report.details}</q>}
      <div className="report-snapshot">
        {report.snapshotTitle && <strong>{report.snapshotTitle}</strong>}
        <p>{report.snapshot}</p>
      </div>
      <div className="actions review-actions">
        {!isMessage &&
          (!post ? (
            <span className="muted">This post was deleted.</span>
          ) : post.reviewStatus === 'hidden' ? (
            <span className="status-pill review-hidden">Post hidden</span>
          ) : (
            <button type="button" className="react" disabled={busy} onClick={handleHide}>
              Hide post
            </button>
          ))}
        <button type="button" className="primary" disabled={busy} onClick={handleMarkHandled}>
          Mark handled
        </button>
      </div>
    </article>
  )
}
