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

export function findMatches(users, reputationByUser, me) {
  if (!me) return []
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
      const theyTeach = theyTeachWhatINeed.map((subject) => ({
        subject,
        score: getReputation(reputationByUser, other.id, subject),
      }))
      return {
        user: other,
        theyTeach,
        youTeach: iTeachWhatTheyNeed,
        helperScore: Math.max(0, ...theyTeach.map((row) => row.score)),
      }
    })
    .filter(Boolean)
    .sort((a, b) => compareHelpers(a, b, me))
}

function compareHelpers(a, b, me) {
  if (b.helperScore !== a.helperScore) return b.helperScore - a.helperScore
  const myGrade = me.grade ?? 0
  const aGrade = a.user.grade ?? 0
  const bGrade = b.user.grade ?? 0
  const aAtOrAbove = aGrade >= myGrade ? 1 : 0
  const bAtOrAbove = bGrade >= myGrade ? 1 : 0
  if (bAtOrAbove !== aAtOrAbove) return bAtOrAbove - aAtOrAbove
  const aProx = Math.abs(aGrade - myGrade)
  const bProx = Math.abs(bGrade - myGrade)
  if (aProx !== bProx) return aProx - bProx
  return bGrade - aGrade
}

export function formatPostedAt(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function subjectRows(userId, offers, needs) {
  return [
    ...offers.map((subject) => ({ user_id: userId, subject, kind: 'offer' })),
    ...needs.map((subject) => ({ user_id: userId, subject, kind: 'need' })),
  ]
}
