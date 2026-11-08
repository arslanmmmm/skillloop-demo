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
  mapBlock,
  mapHelpRequest,
  mapProfile,
  mapQuestion,
  mapReport,
  mapVote,
} from '../lib/helpers.js'
import {
  fetchExplanationPage,
  fetchExplanationsByIds,
  mergeById,
  newestFirst,
  pageKey,
} from '../lib/explanationPages.js'
import { useAuth } from './AuthContext.jsx'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { profile } = useAuth()
  const [users, setUsers] = useState([])
  // Explanations (with their votes and comments) loaded so far, from every
  // list the student opened. Lists load pages on demand (see explanationPages).
  const [explanations, setExplanations] = useState([])
  // Per list: { cursor, hasMore, error } keyed by pageKey(filters).
  const [explanationPages, setExplanationPages] = useState({})
  const pagesInFlight = useRef(new Set())
  const [votes, setVotes] = useState([])
  const [feedback, setFeedback] = useState([])
  const [questions, setQuestions] = useState([])
  const [helpRequests, setHelpRequests] = useState([])
  // Ratings I gave or received (RLS), plus everyone's averages.
  const [helpRatings, setHelpRatings] = useState([])
  const [ratingSummary, setRatingSummary] = useState({})
  const [reputationByUser, setReputationByUser] = useState({})
  // Students I blocked (RLS only returns my own blocks).
  const [blocks, setBlocks] = useState([])
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
    if (firstError) {
      setError(friendlyError(firstError))
      setLoading(false)
      return
    }
    setUsers(
      (profilesRes.data ?? []).map((row) => mapProfile(row, subjectsRes.data ?? [])),
    )
    setQuestions((questionsRes.data ?? []).map(mapQuestion))
    setHelpRequests((helpRes.data ?? []).map(mapHelpRequest))
    setHelpRatings((ratingsRes.data ?? []).map(mapHelpRating))
    setRatingSummary(buildRatingSummary(summaryRes.data))
    setReputationByUser(buildReputationMap(reputationRes.data))
    setBlocks((blocksRes.data ?? []).map(mapBlock))
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const mergeExplanationData = useCallback((result) => {
    setExplanations((list) => mergeById(list, result.explanations, newestFirst))
    setVotes((list) => mergeById(list, result.votes, () => 0))
    setFeedback((list) =>
      mergeById(list, result.feedback, (a, b) => a.createdAt.localeCompare(b.createdAt)),
    )
  }, [])

  // Loads the next page of one list (the first page when `before` is null).
  const loadExplanationPage = useCallback(
    async (filters, before = null) => {
      const key = pageKey(filters)
      if (pagesInFlight.current.has(key)) return
      pagesInFlight.current.add(key)
      try {
        const result = await fetchExplanationPage(filters, before)
        mergeExplanationData(result)
        setExplanationPages((pages) => ({
          ...pages,
          [key]: { cursor: result.cursor, hasMore: result.hasMore, error: '' },
        }))
      } catch (err) {
        setExplanationPages((pages) => ({
          ...pages,
          [key]: { cursor: before, hasMore: true, ...pages[key], error: friendlyError(err) },
        }))
      } finally {
        pagesInFlight.current.delete(key)
      }
    },
    [mergeExplanationData],
  )

  // Specific posts, e.g. the ones in teacher reports. Throws on failure.
  const loadExplanationsByIds = useCallback(
    async (ids) => {
      mergeExplanationData(await fetchExplanationsByIds(ids))
    },
    [mergeExplanationData],
  )

  // Forget every loaded page; lists on screen load their first page again.
  const resetExplanations = useCallback(() => {
    setExplanations([])
    setVotes([])
    setFeedback([])
    setExplanationPages({})
  }, [])

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

  // Teachers only; the database rejects anyone else and records who reviewed it.
  const reviewExplanation = useCallback(
    async (explanationId, status, note = null) => {
      const { data, error: updateError } = await supabase
        .from('explanations')
        .update({ review_status: status, teacher_note: status === 'needs_correction' ? note : null })
        .eq('id', explanationId)
        .select('*')
        .single()
      if (updateError) throw updateError
      const mapped = mapExplanation(data)
      setExplanations((list) => list.map((item) => (item.id === explanationId ? mapped : item)))
      return mapped
    },
    [],
  )

  // Report a chat message or an explanation. The database copies the reported
  // text and checks that the student can see it and did not write it.
  const reportContent = useCallback(
    async ({ targetType, targetId, reason, details }) => {
      const { error: insertError } = await supabase.from('reports').insert({
        reporter_id: profile?.id,
        target_type: targetType,
        message_id: targetType === 'message' ? targetId : null,
        explanation_id: targetType === 'explanation' ? targetId : null,
        reason,
        details: details || null,
      })
      if (insertError) throw insertError
      showToast('Thanks for reporting. A teacher will look at it.')
    },
    [profile?.id, showToast],
  )

  // Teachers only (RLS): open reports, newest first.
  const fetchOpenReports = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('reports')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    if (loadError) throw loadError
    return (data ?? []).map(mapReport)
  }, [])

  const setReportStatus = useCallback(async (reportId, status) => {
    const { data, error: updateError } = await supabase
      .from('reports')
      .update({ status })
      .eq('id', reportId)
      .select('*')
      .single()
    if (updateError) throw updateError
    return mapReport(data)
  }, [])

  // The blocked student is not told. Their posts disappear from my feed and
  // neither of us can send the other requests or chat messages.
  const blockUser = useCallback(
    async (userId, name) => {
      const { data, error: insertError } = await supabase
        .from('blocks')
        .insert({ blocker_id: profile?.id, blocked_id: userId })
        .select('*')
        .single()
      if (insertError) throw insertError
      setBlocks((list) => [mapBlock(data), ...list])
      setExplanations((list) => list.filter((item) => item.authorId !== userId))
      showToast(`You blocked ${name}. You can undo this on your Profile.`)
    },
    [profile?.id, showToast],
  )

  const unblockUser = useCallback(
    async (userId, name) => {
      const { error: deleteError } = await supabase
        .from('blocks')
        .delete()
        .eq('blocker_id', profile?.id)
        .eq('blocked_id', userId)
      if (deleteError) throw deleteError
      setBlocks((list) => list.filter((item) => item.blockedId !== userId))
      showToast(`You unblocked ${name}.`)
      // Their posts come back when the lists reload.
      resetExplanations()
    },
    [profile?.id, showToast, resetExplanations],
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

  const blockedIds = useMemo(() => new Set(blocks.map((item) => item.blockedId)), [blocks])

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
      reviewExplanation,
      addFeedback,
      deleteFeedback,
      sendHelpRequest,
      respondToHelpRequest,
      addHelpRating,
      helpRatings,
      ratingSummary,
      blocks,
      blockedIds,
      reportContent,
      fetchOpenReports,
      setReportStatus,
      blockUser,
      unblockUser,
      explanationPages,
      loadExplanationPage,
      loadExplanationsByIds,
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
      reviewExplanation,
      addFeedback,
      deleteFeedback,
      sendHelpRequest,
      respondToHelpRequest,
      addHelpRating,
      helpRatings,
      ratingSummary,
      blocks,
      blockedIds,
      reportContent,
      fetchOpenReports,
      setReportStatus,
      blockUser,
      unblockUser,
      explanationPages,
      loadExplanationPage,
      loadExplanationsByIds,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}
