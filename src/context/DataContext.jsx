import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { supabase } from '../lib/supabaseClient.js'
import {
  buildRatingSummary,
  buildReputationMap,
  friendlyError,
  getReputation,
  mapExplanation,
  mapFeedback,
  mapHelpRating,
  mapHelpRequest,
  mapProfile,
  mapQuestion,
  mapVote,
} from '../lib/helpers.js'
import { useAuth } from './AuthContext.jsx'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { profile } = useAuth()
  const [users, setUsers] = useState([])
  const [explanations, setExplanations] = useState([])
  const [votes, setVotes] = useState([])
  const [feedback, setFeedback] = useState([])
  const [questions, setQuestions] = useState([])
  const [helpRequests, setHelpRequests] = useState([])
  // Ratings I gave or received (RLS), plus everyone's averages.
  const [helpRatings, setHelpRatings] = useState([])
  const [ratingSummary, setRatingSummary] = useState({})
  const [reputationByUser, setReputationByUser] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  // Explanations with a vote still being saved; extra clicks are ignored until it finishes.
  const votesInFlight = useRef(new Set())

  const showToast = useCallback((message) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2800)
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    const [
      profilesRes,
      subjectsRes,
      explanationsRes,
      votesRes,
      reputationRes,
      feedbackRes,
      questionsRes,
      helpRes,
      ratingsRes,
      summaryRes,
    ] = await Promise.all([
      supabase.from('profiles').select('*').order('display_name'),
      supabase.from('user_subjects').select('*'),
      supabase.from('explanations').select('*').order('created_at', { ascending: false }),
      supabase.from('votes').select('*'),
      supabase.from('subject_reputation').select('*'),
      supabase.from('feedback').select('*').order('created_at', { ascending: true }),
      supabase.from('questions').select('*').order('created_at', { ascending: false }),
      supabase.from('help_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('help_ratings').select('*'),
      supabase.from('helper_rating_summary').select('*'),
    ])
    const firstError =
      profilesRes.error ||
      subjectsRes.error ||
      explanationsRes.error ||
      votesRes.error ||
      reputationRes.error ||
      feedbackRes.error ||
      questionsRes.error ||
      helpRes.error ||
      ratingsRes.error ||
      summaryRes.error
    if (firstError) {
      setError(friendlyError(firstError))
      setLoading(false)
      return
    }
    setUsers(
      (profilesRes.data ?? []).map((row) => mapProfile(row, subjectsRes.data ?? [])),
    )
    setExplanations((explanationsRes.data ?? []).map(mapExplanation))
    setVotes((votesRes.data ?? []).map(mapVote))
    setFeedback((feedbackRes.data ?? []).map(mapFeedback))
    setQuestions((questionsRes.data ?? []).map(mapQuestion))
    setHelpRequests((helpRes.data ?? []).map(mapHelpRequest))
    setHelpRatings((ratingsRes.data ?? []).map(mapHelpRating))
    setRatingSummary(buildRatingSummary(summaryRes.data))
    setReputationByUser(buildReputationMap(reputationRes.data))
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Live updates for help requests: a new request or an accept/decline shows
  // up without a reload. Realtime applies the same RLS, so each student only
  // receives requests they are part of.
  const meId = profile?.id
  useEffect(() => {
    if (!meId) return undefined
    const channel = supabase
      .channel(`help-requests-${meId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'help_requests' },
        (payload) => {
          if (!payload.new?.id) return
          const mapped = mapHelpRequest(payload.new)
          setHelpRequests((list) =>
            list.some((item) => item.id === mapped.id)
              ? list.map((item) => (item.id === mapped.id ? mapped : item))
              : [mapped, ...list],
          )
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [meId])

  // Live ratings: when someone rates my help, show it and refresh the averages.
  useEffect(() => {
    if (!meId) return undefined
    const channel = supabase
      .channel(`help-ratings-${meId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'help_ratings' },
        async (payload) => {
          if (!payload.new?.request_id) return
          const mapped = mapHelpRating(payload.new)
          setHelpRatings((list) =>
            list.some((item) => item.requestId === mapped.requestId) ? list : [...list, mapped],
          )
          const { data } = await supabase.from('helper_rating_summary').select('*')
          if (data) setRatingSummary(buildRatingSummary(data))
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [meId])

  const refreshReputation = useCallback(async () => {
    const { data, error: repError } = await supabase
      .from('subject_reputation')
      .select('*')
    if (repError) throw repError
    setReputationByUser(buildReputationMap(data))
  }, [])

  const toggleVote = useCallback(
    async (explanationId) => {
      const meId = profile?.id
      if (!meId) return
      const explanation = explanations.find((item) => item.id === explanationId)
      if (explanation?.authorId === meId) {
        showToast('You cannot vote on your own explanation.')
        return
      }
      if (votesInFlight.current.has(explanationId)) return
      votesInFlight.current.add(explanationId)
      const existing = votes.find(
        (item) => item.explanationId === explanationId && item.userId === meId,
      )
      const previous = votes

      if (existing) {
        setVotes(votes.filter((item) => item.id !== existing.id))
      } else {
        setVotes([
          ...votes,
          {
            id: `temp-${explanationId}`,
            explanationId,
            userId: meId,
            createdAt: new Date().toISOString(),
          },
        ])
      }

      try {
        if (existing) {
          const { error: deleteError } = await supabase
            .from('votes')
            .delete()
            .eq('id', existing.id)
          if (deleteError) throw deleteError
        } else {
          const { data, error: insertError } = await supabase
            .from('votes')
            .insert({
              explanation_id: explanationId,
              user_id: meId,
            })
            .select('*')
            .single()
          if (insertError) throw insertError
          setVotes((list) =>
            list.map((item) =>
              item.id === `temp-${explanationId}` ? mapVote(data) : item,
            ),
          )
        }
        await refreshReputation()
      } catch (err) {
        setVotes(previous)
        showToast(friendlyError(err))
      } finally {
        votesInFlight.current.delete(explanationId)
      }
    },
    [profile?.id, explanations, votes, showToast, refreshReputation],
  )

  const addExplanation = useCallback(
    async ({ subject, title, text }) => {
      const meId = profile?.id
      if (!meId) throw new Error('Not signed in')
      const { data, error: insertError } = await supabase
        .from('explanations')
        .insert({
          author_id: meId,
          subject,
          title,
          body: text,
        })
        .select('*')
        .single()
      if (insertError) throw insertError
      setExplanations((list) => [mapExplanation(data), ...list])
      await refreshReputation()
      return mapExplanation(data)
    },
    [profile?.id, refreshReputation],
  )

  const addFeedback = useCallback(
    async ({ explanationId, body, clarityRating, parentId = null }) => {
      const meId = profile?.id
      if (!meId) throw new Error('Not signed in')
      const payload = {
        explanation_id: explanationId,
        author_id: meId,
        parent_id: parentId,
        body,
        clarity_rating: parentId ? null : clarityRating,
      }
      const { data, error: insertError } = await supabase
        .from('feedback')
        .insert(payload)
        .select('*')
        .single()
      if (insertError) throw insertError
      const mapped = mapFeedback(data)
      setFeedback((list) => [...list, mapped])
      return mapped
    },
    [profile?.id],
  )

  // Only the comment's own author can delete it (RLS). Deleting a comment also
  // deletes its replies in the database, so drop them here too.
  const deleteFeedback = useCallback(async (feedbackId) => {
    const { data, error: deleteError } = await supabase
      .from('feedback')
      .delete()
      .eq('id', feedbackId)
      .select('id')
    if (deleteError) throw deleteError
    if (!data?.length) throw new Error('You can only delete your own comments.')
    setFeedback((list) =>
      list.filter((item) => item.id !== feedbackId && item.parentId !== feedbackId),
    )
  }, [])

  const sendHelpRequest = useCallback(
    async ({ helperId, subject, topic, message = null, helperName }) => {
      const meId = profile?.id
      if (!meId) throw new Error('Not signed in')
      const { data, error: insertError } = await supabase
        .from('help_requests')
        .insert({
          requester_id: meId,
          helper_id: helperId,
          subject,
          topic,
          message,
        })
        .select('*')
        .single()
      if (insertError) throw insertError
      const mapped = mapHelpRequest(data)
      setHelpRequests((list) => [mapped, ...list])
      showToast(`Request sent to ${helperName}. They can accept or decline.`)
      return mapped
    },
    [profile?.id, showToast],
  )

  const respondToHelpRequest = useCallback(
    async (requestId, status) => {
      const { data, error: updateError } = await supabase
        .from('help_requests')
        .update({ status })
        .eq('id', requestId)
        .select('*')
        .single()
      if (updateError) throw updateError
      const mapped = mapHelpRequest(data)
      setHelpRequests((list) => list.map((item) => (item.id === requestId ? mapped : item)))
      showToast(
        {
          accepted: 'You accepted this request.',
          declined: 'You declined this request.',
          resolved: 'Marked as resolved. The chat is now read-only.',
        }[status],
      )
      return mapped
    },
    [showToast],
  )

  // The database fills in the helper and checks the request is resolved and
  // that only the student who asked can rate it.
  const addHelpRating = useCallback(
    async ({ requestId, helperId, rating, comment }) => {
      const meId = profile?.id
      if (!meId) throw new Error('Not signed in')
      const { data, error: insertError } = await supabase
        .from('help_ratings')
        .insert({ request_id: requestId, rater_id: meId, helper_id: helperId, rating, comment })
        .select('*')
        .single()
      if (insertError) throw insertError
      const mapped = mapHelpRating(data)
      setHelpRatings((list) => [...list, mapped])
      // Refresh averages so the helper's profile and cards update straight away.
      const { data: summary } = await supabase.from('helper_rating_summary').select('*')
      if (summary) setRatingSummary(buildRatingSummary(summary))
      showToast('Thanks! Your rating was saved.')
      return mapped
    },
    [profile?.id, showToast],
  )

  const userById = useMemo(
    () => Object.fromEntries(users.map((item) => [item.id, item])),
    [users],
  )

  const value = useMemo(
    () => ({
      users,
      explanations,
      votes,
      feedback,
      questions,
      helpRequests,
      loading,
      error,
      toast,
      userById,
      reputationByUser,
      showToast,
      loadAll,
      toggleVote,
      addExplanation,
      addFeedback,
      deleteFeedback,
      sendHelpRequest,
      respondToHelpRequest,
      addHelpRating,
      helpRatings,
      ratingSummary,
      reputation: (userId, subject) =>
        getReputation(reputationByUser, userId, subject),
    }),
    [
      users,
      explanations,
      votes,
      feedback,
      questions,
      helpRequests,
      loading,
      error,
      toast,
      userById,
      reputationByUser,
      showToast,
      loadAll,
      toggleVote,
      addExplanation,
      addFeedback,
      deleteFeedback,
      sendHelpRequest,
      respondToHelpRequest,
      addHelpRating,
      helpRatings,
      ratingSummary,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}
