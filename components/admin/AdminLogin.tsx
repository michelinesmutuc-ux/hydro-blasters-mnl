'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase/client'
import styles from './admin.module.css'

function safeAdminPath(value: string | null) {
  return value?.startsWith('/admin') && !value.startsWith('/admin/login') ? value : '/admin'
}

export function AdminLogin() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(searchParams.get('reason') === 'unauthorized' ? 'This account is not authorized to access the admin portal.' : null)

  useEffect(() => {
    let isMounted = true
    async function checkExistingSession() {
      const { data, error: userError } = await supabase.auth.getUser()
      if (!isMounted) return
      if (!userError && data.user?.app_metadata?.role === 'admin') {
        router.replace(safeAdminPath(searchParams.get('next')))
        return
      }
      setIsCheckingSession(false)
    }
    checkExistingSession()
    return () => { isMounted = false }
  }, [router, searchParams])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSigningIn(true)
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError || !data.user) {
      setError(signInError?.message ?? 'We could not sign you in. Check your email and password.')
      setIsSigningIn(false)
      return
    }

    const { data: verifiedUser, error: userError } = await supabase.auth.getUser()
    if (userError || verifiedUser.user?.app_metadata?.role !== 'admin') {
      await supabase.auth.signOut()
      setError('This account is not authorized to access the admin portal.')
      setIsSigningIn(false)
      return
    }
    router.replace(safeAdminPath(searchParams.get('next')))
  }

  return (
    <main className={styles.loginShell}>
      <section className={styles.loginCard} aria-labelledby="admin-login-title">
        <img src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" />
        <p className={styles.eyebrow}>Restricted area</p>
        <h1 id="admin-login-title">Admin sign in</h1>
        <p>Use an authorized administrator email and password.</p>
        {isCheckingSession ? <p className={styles.loginState} role="status">Checking your session…</p> : <form className={styles.loginForm} onSubmit={handleSubmit}>
          {error && <p className={styles.errorMessage} role="alert">{error}</p>}
          <div className={styles.field}><label htmlFor="admin-email">Email</label><input id="admin-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className={styles.field}><label htmlFor="admin-password">Password</label><input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          <button className={styles.primaryButton} type="submit" disabled={isSigningIn}>{isSigningIn ? 'Signing in…' : 'Sign in'}</button>
        </form>}
      </section>
    </main>
  )
}
