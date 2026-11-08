// Under a paged list: "Load more", or the error with a retry button.
export default function LoadMore({ hasMore, loadingMore, error, onLoadMore }) {
  if (error) {
    return (
      <div className="load-more">
        <p className="form-error">{error}</p>
        <button type="button" className="react" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? 'Loading…' : 'Try again'}
        </button>
      </div>
    )
  }
  if (!hasMore) return null
  return (
    <div className="load-more">
      <button type="button" className="react" disabled={loadingMore} onClick={onLoadMore}>
        {loadingMore ? 'Loading…' : 'Load more'}
      </button>
    </div>
  )
}
