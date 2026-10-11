import { reputationTier } from '../config/reputation.js'

export default function ReputationBadge({ score, subject }) {
  const tier = reputationTier(score)
  const votes = `${score} helpful ${score === 1 ? 'vote' : 'votes'}`
  const detail = subject ? `${votes} in ${subject}` : votes
  return (
    <span className={`badge tier-${tier.key}`} title={detail} aria-label={`${tier.label}: ${detail}`}>
      {tier.label}
    </span>
  )
}
