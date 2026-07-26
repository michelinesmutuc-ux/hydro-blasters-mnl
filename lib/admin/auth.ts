import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase/client'

export async function requireAdminSession(): Promise<Session> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(`Unable to read the current session. ${error.message}`)
  if (!data.session) throw new Error('No active session. Sign in with an administrator account.')
  if (data.session.user.app_metadata?.role !== 'admin') {
    throw new Error('This signed-in account does not have the administrator role.')
  }
  return data.session
}
