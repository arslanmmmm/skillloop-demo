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
      return {
        user: other,
        theyTeach: theyTeachWhatINeed.map((subject) => ({
          subject,
          score: getReputation(reputationByUser, other.id, subject),
        })),
        youTeach: iTeachWhatTheyNeed,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aMax = Math.max(0, ...a.theyTeach.map((row) => row.score))
      const bMax = Math.max(0, ...b.theyTeach.map((row) => row.score))
      return bMax - aMax
    })
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
