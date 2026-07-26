'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import styles from './admin.module.css'

type DebugState = { userId: string; email: string; role: string; expiresAt: string }

export function AdminDebugPanel() {
  const [state, setState] = useState<DebugState | null>(null)
  const [diagnostic, setDiagnostic] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession()
      const session = data.session
      setState(session ? {
        userId: session.user.id,
        email: session.user.email ?? 'Not provided',
        role: typeof session.user.app_metadata?.role === 'string' ? session.user.app_metadata.role : 'Not set',
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'Not provided',
      } : null)
    }
    load()
  }, [])

  async function runDatabaseCheck() {
    setDiagnostic('Checking database authorization…')
    const { data, error } = await supabase.rpc('admin_authorization_diagnostics')
    if (error) {
      setDiagnostic(`Database authorization check failed: ${error.code ?? 'unknown'} — ${error.message}`)
      return
    }
    const row = Array.isArray(data) ? data[0] : data
    setDiagnostic(row?.is_admin ? `Database authorization check passed for ${row.user_id}.` : 'Database authorization check failed: this session does not have the admin role claim.')
  }

  return <details className={styles.debugPanel}>
    <summary>Admin connection diagnostics</summary>
    <dl>
      <div><dt>User ID</dt><dd>{state?.userId ?? 'No session'}</dd></div>
      <div><dt>Email</dt><dd>{state?.email ?? 'No session'}</dd></div>
      <div><dt>Session exists</dt><dd>{state ? 'Yes' : 'No'}</dd></div>
      <div><dt>app_metadata.role</dt><dd>{state?.role ?? 'Not set'}</dd></div>
      <div><dt>JWT expires at</dt><dd>{state?.expiresAt ?? 'Not provided'}</dd></div>
    </dl>
    <button type="button" className={styles.rowAction} onClick={runDatabaseCheck}>Run database authorization check</button>
    {diagnostic && <p role="status">{diagnostic}</p>}
  </details>
}
