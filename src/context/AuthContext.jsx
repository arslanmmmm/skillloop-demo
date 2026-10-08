import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { mapProfile, subjectRows } from '../lib/helpers.js'

const AuthContext = createContext(null)

async function fetchProfile(userId) {
  if (!userId) return null
  const [profileRes, subjectsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('user_subjects').select('*').eq('user_id', userId),
  ])
  if (profileRes.error) throw profileRes.error
  if (subjectsRes.error) throw subjectsRes.error
  return mapProfile(profileRes.data, subjectsRes.data ?? [])
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      setProfileError('')
      return null
    }
    setProfileLoading(true)
    setProfileError('')
    try {
      const mapped = await fetchProfile(userId)
      setProfile(mapped)
      return mapped
    } catch (err) {
      console.error(err)
      setProfileError(err.message || 'Could not load your profile.')
      setProfile(null)
      return null
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive) return
      if (error) console.error(error)
      const nextSession = data?.session ?? null
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      await loadProfile(nextSession?.user?.id)
      if (alive) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'INITIAL_SESSION') return
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      window.setTimeout(() => {
        loadProfile(nextSession?.user?.id)
      }, 0)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(
    async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      setSession(data.session)
      setUser(data.user ?? null)
      await loadProfile(data.user?.id)
    },
    [loadProfile],
  )

  const saveProfileAndSubjects = useCallback(
    async ({ displayName, grade, offers, needs, userId }) => {
      const id = userId || user?.id
      if (!id) throw new Error('Not signed in')
      const { error: profileError } = await supabase.from('profiles').upsert({
        id,
        display_name: displayName,
        grade,
      })
      if (profileError) throw profileError

      const { error: deleteError } = await supabase
        .from('user_subjects')
        .delete()
        .eq('user_id', id)
      if (deleteError) throw deleteError

      const rows = subjectRows(id, offers, needs)
      if (rows.length) {
        const { error: insertError } = await supabase.from('user_subjects').insert(rows)
        if (insertError) throw insertError
      }

      const mapped = await fetchProfile(id)
      setProfile(mapped)
      return mapped
    },
    [user?.id],
  )

  const signUp = useCallback(
    async ({ email, password, displayName, grade, offers, needs }) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            grade: String(grade),
            offers,
            needs,
          },
        },
      })
      if (error) throw error
      if (!data.session) {
        throw new Error(
          'Account created, but email confirmation is still on. Turn it off in Supabase Auth settings, or confirm the email, then sign in.',
        )
      }
      setSession(data.session)
      setUser(data.user ?? null)
      await saveProfileAndSubjects({
        displayName,
        grade,
        offers,
        needs,
        userId: data.user.id,
      })
    },
    [saveProfileAndSubjects],
  )

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setProfile(null)
  }, [])

  const refreshProfile = useCallback(
    () => loadProfile(user?.id),
    [loadProfile, user?.id],
  )

  const value = useMemo(
    () => ({
      user,
      session,
      profile,
      loading,
      profileLoading,
      profileError,
      signIn,
      signUp,
      signOut,
      completeProfile: saveProfileAndSubjects,
      refreshProfile,
    }),
    [
      user,
      session,
      profile,
      loading,
      profileLoading,
      profileError,
      signIn,
      signUp,
      signOut,
      saveProfileAndSubjects,
      refreshProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
