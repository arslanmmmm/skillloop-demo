import { useEffect, useMemo, useRef, useState } from 'react'
import { filtersFromKey, isLoaded, matchesFilters, pageKey } from '../lib/explanationPages.js'
import { useAppData } from './useAppData.js'

// One list of explanations (Feed, Review, Profile) loaded a page at a time.
// `filters` is { subject?, status?, authorId? }; 'all' or empty means any.
export function usePagedExplanations(filters) {
  const { explanations, explanationPages, loadExplanationPage } = useAppData()
  const key = pageKey(filters)
  const page = explanationPages[key]
  const [loadingMore, setLoadingMore] = useState(false)
  // Blocks a second "Load more" in the same instant.
  const busy = useRef(false)

  // First page when this list is opened (or after the loaded posts were reset).
  useEffect(() => {
    if (!page) loadExplanationPage(filtersFromKey(key), null)
  }, [key, page, loadExplanationPage])

  // Everything loaded that belongs to this list, without gaps: posts newer than
  // the last one loaded, or all of them once the last page was reached.
  const items = useMemo(() => {
    if (!page) return []
    const parsed = filtersFromKey(key)
    const matching = explanations.filter((item) => matchesFilters(item, parsed))
    if (!page.hasMore) return matching
    if (!page.cursor) return []
    return matching.filter((item) => isLoaded(item, page.cursor))
  }, [explanations, page, key])

  async function loadMore() {
    if (busy.current || !page) return
    busy.current = true
    setLoadingMore(true)
    try {
      await loadExplanationPage(filtersFromKey(key), page.cursor)
    } finally {
      busy.current = false
      setLoadingMore(false)
    }
  }

  return {
    items,
    isLoading: !page,
    error: page?.error ?? '',
    hasMore: Boolean(page?.hasMore),
    loadingMore,
    loadMore,
  }
}
