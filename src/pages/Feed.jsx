import { useSearchParams } from 'react-router-dom'
import FeedCard, { FeedSkeleton } from '../components/FeedCard.jsx'
import LoadMore from '../components/LoadMore.jsx'
import { SUBJECTS } from '../config/subjects.js'
import { useAppData } from '../hooks/useAppData.js'
import { usePagedExplanations } from '../hooks/usePagedExplanations.js'

export default function FeedPage() {
  const { userById } = useAppData()
  // The subject lives in the address (?subject=Math) so Back keeps the filter.
  const [params, setParams] = useSearchParams()
  const subject = SUBJECTS.includes(params.get('subject')) ? params.get('subject') : 'all'
  const { items, isLoading, error, hasMore, loadingMore, loadMore } = usePagedExplanations({
    subject,
  })

  function changeSubject(next) {
    setParams(next === 'all' ? {} : { subject: next }, { replace: true })
  }

  return (
    <section>
      <h2>Explanation board</h2>
      <p className="hint">
        Vote once if an explanation helped you. You cannot vote on your own
        post. Add a comment and a 1–5 clarity rating. Votes raise the author’s
        reputation in that subject, which sets their label: New, Trusted, or Top
        explainer.
      </p>
      <div className="card form feed-filter">
        <label>
          Subject
          <select value={subject} onChange={(event) => changeSubject(event.target.value)}>
            <option value="all">All subjects</option>
            {SUBJECTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isLoading ? (
        <FeedSkeleton />
      ) : items.length === 0 && !error ? (
        <p className="empty">
          {subject === 'all'
            ? 'No explanations yet. Write the first one.'
            : `No ${subject} explanations yet. Write the first one.`}
        </p>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <FeedCard key={item.id} item={item} author={userById[item.authorId]} />
          ))}
        </div>
      )}
      {!isLoading && (
        <LoadMore hasMore={hasMore} loadingMore={loadingMore} error={error} onLoadMore={loadMore} />
      )}
    </section>
  )
}
