export function initials(name) {
  return (name || '?')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function mapProfile(row, subjects = []) {
  if (!row) return null
  const mine = subjects.filter((item) => item.user_id === row.id)
  return {
    id: row.id,
    displayName: row.display_name,
    grade: row.grade,
    role: row.role,
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

// Everyone who teaches `subject`, ranked by their reputation in it, then by
// how close their grade is to mine. `youTeach` marks a two-way trade.
export function findHelpers(users, reputationByUser, me, subject) {
  if (!me || !subject) return []
  return users
    .filter((other) => other.id !== me.id && other.offers.includes(subject))
    .map((other) => ({
      user: other,
      score: getReputation(reputationByUser, other.id, subject),
      gradeGap: gradeGap(me.grade, other.grade),
      youTeach: me.offers.filter((item) => other.needs.includes(item)),
    }))
    .sort(
      (a, b) =>
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

// Turns database and network errors into short messages a student understands.
// Our own triggers already raise plain-English messages (code P0001).
export function friendlyError(err) {
  const message = err?.message || ''
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return 'Could not reach the server. Check your internet connection and try again.'
  }
  if (err?.code === '23505' || /duplicate key/i.test(message)) {
    return /votes_/.test(message) ? 'You already voted on this.' : 'That was already saved.'
  }
  if (err?.code === '23514' || /violates check constraint/i.test(message)) {
    if (/title/.test(message)) return 'The title is too long. Keep it under 120 characters.'
    if (/body/.test(message)) return 'The text is too long. Keep it under 4000 characters.'
    return 'Some of what you entered is too long or not allowed. Please check it and try again.'
  }
  if (err?.code === '42501' || /row-level security/i.test(message)) {
    return 'You are not allowed to do that.'
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
