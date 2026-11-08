import { supabase } from './supabaseClient.js'
import { mapExplanation, mapFeedback, mapVote } from './helpers.js'

// Explanations are loaded a page at a time, newest first, instead of all at
// once (bug #8). Each list (Feed, Review, Profile) is identified by its filters.
export const PAGE_SIZE = 20

const ALL = 'all'

export function pageKey({ subject = ALL, status = ALL, authorId = '' } = {}) {
  return JSON.stringify([subject, status, authorId])
}

export function filtersFromKey(key) {
  const [subject, status, authorId] = JSON.parse(key)
  return { subject, status, authorId }
}

export function matchesFilters(item, { subject = ALL, status = ALL, authorId = '' }) {
  return (
    (subject === ALL || item.subject === subject) &&
    (status === ALL || item.reviewStatus === status) &&
    (!authorId || item.authorId === authorId)
  )
}

// Postgres times have microseconds, which Date drops, so compare them as
// [milliseconds, microseconds]. Ties are broken by id, like the database.
function timeParts(iso) {
  const match = /^(.+T\d\d:\d\d:\d\d)(?:\.(\d+))?(.*)$/.exec(iso)
  if (!match) return [new Date(iso).getTime(), 0]
  const [, base, fraction = '', zone] = match
  return [new Date(base + zone).getTime(), Number(fraction.padEnd(6, '0').slice(0, 6))]
}

function compareCreated(a, b) {
  const [msA, microA] = timeParts(a.createdAt)
  const [msB, microB] = timeParts(b.createdAt)
  if (msA !== msB) return msA - msB
  if (microA !== microB) return microA - microB
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function newestFirst(a, b) {
  return compareCreated(b, a)
}

// True when `item` is the cursor post or newer, i.e. already within the pages loaded.
export function isLoaded(item, cursor) {
  return compareCreated(item, cursor) >= 0
}

// Adds or replaces rows by id, keeping the list sorted.
export function mergeById(list, rows, compare) {
  if (rows.length === 0) return list
  const byId = new Map(list.map((item) => [item.id, item]))
  for (const row of rows) byId.set(row.id, row)
  return [...byId.values()].sort(compare)
}

// Votes and comments only for the explanations being shown.
async function fetchExtras(ids) {
  if (ids.length === 0) return { votes: [], feedback: [] }
  const [votesRes, feedbackRes] = await Promise.all([
    supabase.from('votes').select('*').in('explanation_id', ids),
    supabase
      .from('feedback')
      .select('*')
      .in('explanation_id', ids)
      .order('created_at', { ascending: true }),
  ])
  const failed = votesRes.error || feedbackRes.error
  if (failed) throw failed
  return {
    votes: (votesRes.data ?? []).map(mapVote),
    feedback: (feedbackRes.data ?? []).map(mapFeedback),
  }
}

// One page older than `before` ({ createdAt, id } of the last post shown), or
// the newest page when null.
// Asks for one extra row to know whether there is another page.
export async function fetchExplanationPage(filters, before) {
  let query = supabase
    .from('explanations')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)
  if (filters.subject && filters.subject !== ALL) query = query.eq('subject', filters.subject)
  if (filters.status && filters.status !== ALL) query = query.eq('review_status', filters.status)
  if (filters.authorId) query = query.eq('author_id', filters.authorId)
  if (before) {
    query = query.or(
      `created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt.${before.id})`,
    )
  }

  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []).slice(0, PAGE_SIZE).map(mapExplanation)
  const extras = await fetchExtras(rows.map((item) => item.id))
  return {
    explanations: rows,
    ...extras,
    hasMore: (data ?? []).length > PAGE_SIZE,
    cursor: rows.length > 0 ? { createdAt: rows.at(-1).createdAt, id: rows.at(-1).id } : before,
  }
}

// Specific explanations, e.g. the ones teachers see in reports.
export async function fetchExplanationsByIds(ids) {
  if (ids.length === 0) return { explanations: [], votes: [], feedback: [] }
  const { data, error } = await supabase.from('explanations').select('*').in('id', ids)
  if (error) throw error
  const rows = (data ?? []).map(mapExplanation)
  const extras = await fetchExtras(rows.map((item) => item.id))
  return { explanations: rows, ...extras }
}
