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
  buildReputationMap,
  findMatches,
  getReputation,
  mapExplanation,
  mapProfile,
  mapVote,
} from '../lib/helpers.js'
import { useAuth } from './AuthContext.jsx'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { profile } = useAuth()
  const [users, setUsers] = useState([])
  const [explanations, setExplanations] = useState([])
  const [votes, setVotes] = useState([])
  const [reputationByUser, setReputationByUser] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [requestedIds, setRequestedIds] = useState([])
  const toastTimer = useRef(null)

  const showToast = useCallback((message) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2800)
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    const [profilesRes, subjectsRes, explanationsRes, votesRes, reputationRes] =
      await Promise.all([
        supabase.from('profiles').select('*').order('display_name'),
        supabase.from('user_subjects').select('*'),
        supabase.from('explanations').select('*').order('created_at', { ascending: false }),
        supabase.from('votes').select('*'),
        supabase.from('subject_reputation').select('*'),
      ])
    const firstError =
      profilesRes.error ||
      subjectsRes.error ||
      explanationsRes.error ||
      votesRes.error ||
      reputationRes.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }
    setUsers(
      (profilesRes.data ?? []).map((row) => mapProfile(row, subjectsRes.data ?? [])),
    )
    setExplanations((explanationsRes.data ?? []).map(mapExplanation))
    setVotes((votesRes.data ?? []).map(mapVote))
    setReputationByUser(buildReputationMap(reputationRes.data))
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

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
        showToast(err.message || 'Could not save vote')
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

  const requestTrade = useCallback(
    (userId, name) => {
      setRequestedIds((ids) => (ids.includes(userId) ? ids : [...ids, userId]))
      showToast(`Trade request sent to ${name}. They’ll see it in a later version.`)
    },
    [showToast],
  )

  const matches = useMemo(
    () => findMatches(users, reputationByUser, profile),
    [users, reputationByUser, profile],
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
      loading,
      error,
      toast,
      requestedIds,
      matches,
      userById,
      reputationByUser,
      showToast,
      loadAll,
      toggleVote,
      addExplanation,
      requestTrade,
      reputation: (userId, subject) =>
        getReputation(reputationByUser, userId, subject),
    }),
    [
      users,
      explanations,
      votes,
      loading,
      error,
      toast,
      requestedIds,
      matches,
      userById,
      reputationByUser,
      showToast,
      loadAll,
      toggleVote,
      addExplanation,
      requestTrade,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}
