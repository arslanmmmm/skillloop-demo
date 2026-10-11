import FeedCard, { FeedSkeleton } from '../components/FeedCard.jsx'
import { useAppData } from '../hooks/useAppData.js'

export default function FeedPage() {
  const { explanations, userById, loading, error } = useAppData()

  return (
    <section>
      <h2>Explanation board</h2>
      <p className="hint">
        Vote once if an explanation helped you. You cannot vote on your own
        post. Add a comment and a 1–5 clarity rating. Votes raise the author’s
        reputation in that subject.
      </p>
      {loading ? (
        <FeedSkeleton />
      ) : error && explanations.length === 0 ? (
        <p className="empty">Could not load explanations. Use Retry above.</p>
      ) : explanations.length === 0 ? (
        <p className="empty">No explanations yet. Write the first one.</p>
      ) : (
        <div className="stack">
          {explanations.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              author={userById[item.authorId]}
            />
          ))}
        </div>
      )}
    </section>
  )
}
