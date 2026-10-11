// Keep labels in one place so feed cards and match cards stay in sync.
export const REPUTATION_TIERS = [
  { min: 8, label: 'Top explainer' },
  { min: 3, label: 'Trusted' },
  { min: 0, label: 'New' },
]

export function reputationLabel(score) {
  const n = Number(score) || 0
  const tier = REPUTATION_TIERS.find((item) => n >= item.min)
  return tier?.label ?? 'New'
}
