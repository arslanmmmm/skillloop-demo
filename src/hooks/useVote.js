export function useVote({ explanation, userId, votes, toggleVote }) {
  const isOwn = Boolean(userId && explanation?.authorId === userId)
  const mine = votes.find(
    (row) => row.explanationId === explanation?.id && row.userId === userId,
  )

  return {
    isOwn,
    canVote: Boolean(userId) && !isOwn,
    voted: Boolean(mine),
    mine,
    toggle: () => {
      if (!explanation || !userId || isOwn) return
      toggleVote(explanation.id)
    },
  }
}
