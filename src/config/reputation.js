// Skill-level labels, shown on explanation, helper and profile cards.
// Reputation is per subject: the number of helpful votes other students gave
// an author's explanations in that subject (see subject_reputation in schema.sql).
// A student is at the highest tier whose `min` they reach. Keep tiers sorted
// from highest to lowest; `key` picks the badge colour in App.css (.tier-<key>).
export const REPUTATION_TIERS = [
  { min: 8, key: 'top', label: 'Top explainer' },
  { min: 3, key: 'trusted', label: 'Trusted' },
  { min: 0, key: 'new', label: 'New' },
]

export function reputationTier(score) {
  const n = Number(score) || 0
  return REPUTATION_TIERS.find((item) => n >= item.min) ?? REPUTATION_TIERS.at(-1)
}
