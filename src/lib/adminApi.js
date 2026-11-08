import { supabase } from './supabaseClient.js'

// Admin-only database functions (008_admin_approvals.sql). The database
// refuses them for anyone who is not an admin.

export async function fetchTeacherRequests() {
  const { data, error } = await supabase.rpc('list_teacher_requests')
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    createdAt: row.created_at,
  }))
}

export async function fetchTeachers() {
  const { data, error } = await supabase.rpc('list_teachers')
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    isAdmin: row.is_admin,
  }))
}

// decision: 'approve' | 'decline' | 'remove'
export async function decideTeacher(userId, decision) {
  const { error } = await supabase.rpc('decide_teacher', { target: userId, decision })
  if (error) throw error
}
