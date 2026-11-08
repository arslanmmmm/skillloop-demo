import { supabase } from './supabaseClient.js'
import {
  buildRatingSummary,
  buildReputationMap,
  mapBlock,
  mapHelpRating,
  mapHelpRequest,
  mapProfile,
  mapQuestion,
} from './helpers.js'

// Everything the app needs on every page, loaded once after sign-in.
// Explanations are not here: lists load them a page at a time (explanationPages.js).
// Throws the first database error.
export async function fetchCoreData() {
  const [
    profilesRes,
    subjectsRes,
    reputationRes,
    questionsRes,
    helpRes,
    ratingsRes,
    summaryRes,
    blocksRes,
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('display_name'),
    supabase.from('user_subjects').select('*'),
    supabase.from('subject_reputation').select('*'),
    supabase.from('questions').select('*').order('created_at', { ascending: false }),
    supabase.from('help_requests').select('*').order('created_at', { ascending: false }),
    supabase.from('help_ratings').select('*'),
    supabase.from('helper_rating_summary').select('*'),
    supabase.from('blocks').select('*').order('created_at', { ascending: false }),
  ])
  const firstError =
    profilesRes.error ||
    subjectsRes.error ||
    reputationRes.error ||
    questionsRes.error ||
    helpRes.error ||
    ratingsRes.error ||
    summaryRes.error ||
    blocksRes.error
  if (firstError) throw firstError

  return {
    users: (profilesRes.data ?? []).map((row) => mapProfile(row, subjectsRes.data ?? [])),
    questions: (questionsRes.data ?? []).map(mapQuestion),
    helpRequests: (helpRes.data ?? []).map(mapHelpRequest),
    helpRatings: (ratingsRes.data ?? []).map(mapHelpRating),
    ratingSummary: buildRatingSummary(summaryRes.data),
    reputationByUser: buildReputationMap(reputationRes.data),
    blocks: (blocksRes.data ?? []).map(mapBlock),
  }
}
