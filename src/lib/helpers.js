export function initials(name) {
  return (name || '?')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// "Teacher" for teachers, "Grade 9" for students (badge, cards, chat header).
export function roleLabel(person) {
  if (person?.role === 'teacher') return 'Teacher'
  return `Grade ${person?.grade ?? '—'}`
}

export function mapProfile(row, subjects = []) {
  if (!row) return null
  const mine = subjects.filter((item) => item.user_id === row.id)
  return {
    id: row.id,
    displayName: row.display_name,
    grade: row.grade,
    role: row.role,
    // 'teacher' while a teacher sign-up waits for an admin to approve it.
    requestedRole: row.requested_role ?? null,
    offers: mine.filter((item) => item.kind === 'offer').map((item) => item.subject),
    needs: mine.filter((item) => item.kind === 'need').map((item) => item.subject),
    createdAt: row.created_at,
  }
}

export function mapExplanation(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    subject: row.subject,
    title: row.title,
    text: row.body,
    createdAt: row.created_at,
    reviewStatus: row.review_status ?? 'none',
    teacherNote: row.teacher_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
  }
}

export function mapVote(row) {
  return {
    id: row.id,
    explanationId: row.explanation_id,
    userId: row.user_id,
    createdAt: row.created_at,
  }
}

export function mapFeedback(row) {
  return {
    id: row.id,
    explanationId: row.explanation_id,
    authorId: row.author_id,
    parentId: row.parent_id,
    body: row.body,
    clarityRating: row.clarity_rating,
    createdAt: row.created_at,
  }
}

export function mapQuestion(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    subject: row.subject,
    body: row.body,
    createdAt: row.created_at,
  }
}

export function mapHelpRequest(row) {
  return {
    id: row.id,
    requesterId: row.requester_id,
    helperId: row.helper_id,
    subject: row.subject,
    questionId: row.question_id,
    topic: row.topic,
    message: row.message,
    status: row.status,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
  }
}

export function mapHelpRating(row) {
  return {
    requestId: row.request_id,
    raterId: row.rater_id,
    helperId: row.helper_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  }
}

// helper_rating_summary rows -> { [helperId]: { average, count } }
export function buildRatingSummary(rows) {
  const map = {}
  for (const row of rows ?? []) {
    map[row.helper_id] = { average: Number(row.average), count: row.ratings }
  }
  return map
}

export function mapMessage(row) {
  return {
    id: row.id,
    requestId: row.request_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  }
}

export function mapReport(row) {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type,
    messageId: row.message_id,
    explanationId: row.explanation_id,
    reportedUserId: row.reported_user_id,
    reason: row.reason,
    details: row.details,
    snapshotTitle: row.snapshot_title,
    snapshot: row.snapshot,
    status: row.status,
    handledBy: row.handled_by,
    handledAt: row.handled_at,
    createdAt: row.created_at,
  }
}

export function mapBlock(row) {
  return {
    blockedId: row.blocked_id,
    createdAt: row.created_at,
  }
}

export function feedbackStats(feedback, explanationId) {
  const reviews = (feedback ?? []).filter(
    (item) => item.explanationId === explanationId && !item.parentId,
  )
  if (reviews.length === 0) {
    return { count: 0, average: null }
  }
  const sum = reviews.reduce((total, item) => total + (item.clarityRating || 0), 0)
  return {
    count: reviews.length,
    average: Math.round((sum / reviews.length) * 10) / 10,
  }
}

export function voteCount(votes, explanationId) {
  return votes.filter((item) => item.explanationId === explanationId).length
}

export function buildReputationMap(rows) {
  const map = {}
  for (const row of rows ?? []) {
    if (!map[row.user_id]) map[row.user_id] = {}
    map[row.user_id][row.subject] = row.reputation
  }
  return map
}

export function getReputation(reputationByUser, userId, subject) {
  return reputationByUser[userId]?.[subject] ?? 0
}

// Everyone who teaches `subject`: students first, ranked by their reputation
// in it, then by how close their grade is to mine; teachers after them (votes
// from students do not rank teachers). `youTeach` marks a two-way trade.
// Accounts still waiting for teacher approval are never listed.
export function findHelpers(users, reputationByUser, me, subject) {
  if (!me || !subject) return []
  return users
    .filter(
      (other) =>
        other.id !== me.id &&
        other.offers.includes(subject) &&
        !(other.role !== 'teacher' && other.requestedRole === 'teacher'),
    )
    .map((other) => ({
      user: other,
      isTeacher: other.role === 'teacher',
      score: getReputation(reputationByUser, other.id, subject),
      gradeGap: gradeGap(me.grade, other.grade),
      youTeach:
        other.role === 'teacher' ? [] : me.offers.filter((item) => other.needs.includes(item)),
    }))
    .sort(
      (a, b) =>
        Number(a.isTeacher) - Number(b.isTeacher) ||
        b.score - a.score ||
        a.gradeGap - b.gradeGap ||
        (b.user.grade ?? 0) - (a.user.grade ?? 0) ||
        a.user.displayName.localeCompare(b.user.displayName),
    )
}

function gradeGap(myGrade, theirGrade) {
  if (myGrade == null || theirGrade == null) return Infinity
  return Math.abs(theirGrade - myGrade)
}

export function formatPostedAt(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

// "just now", "5m ago", "3h ago", "2d ago", then a short date after a week.
export function formatTimeAgo(iso) {
  if (!iso) return ''
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatPostedAt(iso)
}

// Length limits from supabase/schema.sql, keyed by the check constraint's name.
// Keep these in sync when a limit changes there.
const TEXT_LIMITS = {
  profiles_display_name_check: { label: 'Your name', max: 80 },
  explanations_title_check: { label: 'The title', max: 120 },
  explanations_body_check: { label: 'The text', max: 4000 },
  feedback_body_check: { label: 'Your comment', max: 500 },
  questions_body_check: { label: 'Your question', max: 1000 },
  messages_body_check: { label: 'Your message', max: 1000 },
  help_requests_topic_length: { label: 'The topic', max: 120 },
  help_requests_message_length: { label: 'Your message', max: 1000 },
  help_ratings_comment_check: { label: 'Your comment', max: 300 },
  reports_details_check: { label: 'Your note', max: 500 },
}

// Turns database and network errors into short messages a student understands.
// Our own triggers already raise plain-English messages (code P0001).
export function friendlyError(err) {
  const message = err?.message || ''
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return 'Could not reach the server. Check your internet connection and try again.'
  }
  if (err?.code === '23505' || /duplicate key/i.test(message)) {
    if (/votes_/.test(message)) return 'You already voted on this.'
    if (/feedback_one_review/.test(message)) return 'You already rated this explanation.'
    if (/help_ratings_pkey/.test(message)) return 'You already rated this help session.'
    if (/reports_one_per/.test(message)) return 'You already reported this. A teacher will look at it.'
    if (/blocks_pkey/.test(message)) return 'You already blocked this student.'
    if (/help_requests_one_pending/.test(message)) {
      return 'You already asked this helper about this subject. Wait for their answer.'
    }
    return 'That was already saved.'
  }
  if (err?.code === '23514' || /violates check constraint/i.test(message)) {
    const constraint = message.match(/check constraint "([^"]+)"/)?.[1]
    const limit = TEXT_LIMITS[constraint]
    if (limit) return `${limit.label} is too long. Keep it under ${limit.max} characters.`
    return 'Some of what you entered is too long or not allowed. Please check it and try again.'
  }
  if (/row-level security.*"messages"/i.test(message)) {
    return 'This chat is closed, so new messages cannot be sent.'
  }
  if (err?.code === '42501' || /row-level security/i.test(message)) {
    return 'You are not allowed to do that.'
  }
  if (/jwt|invalid claim|refresh token/i.test(message)) {
    return 'Your session has expired. Please sign out and sign in again.'
  }
  if (err?.code === 'P0001' && message) return message
  return message || 'Something went wrong. Please try again.'
}

export function toggleItem(list, item) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

// A subject you teach can't also be one you need help with, so adding it to
// offers removes it from needs.
export function toggleOffer(offers, needs, subject) {
  const nextOffers = toggleItem(offers, subject)
  const nextNeeds = nextOffers.includes(subject) ? needs.filter((x) => x !== subject) : needs
  return { offers: nextOffers, needs: nextNeeds }
}

// Same rules for onboarding and the profile editor. Returns an error or ''.
export function validateProfileChoices({ grade, offers, needs }) {
  if (!grade) return 'Pick your grade.'
  if (offers.length === 0) return 'Pick at least one subject you can teach.'
  if (needs.length === 0) return 'Pick at least one subject you need help with.'
  return ''
}

export function subjectRows(userId, offers, needs) {
  return [
    ...offers.map((subject) => ({ user_id: userId, subject, kind: 'offer' })),
    ...needs.map((subject) => ({ user_id: userId, subject, kind: 'need' })),
  ]
}
