'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase/client'
import { requireAdminSession } from '../../lib/admin/auth'
import { AdminDebugPanel } from './AdminDebugPanel'
import styles from './admin.module.css'

type AdminShellProps = {
  active: 'dashboard' | 'products' | 'orders' | 'appointments'
  children: React.ReactNode
}

export function AdminShell({ active, children }: AdminShellProps) {
  return <Suspense fallback={<main className={styles.authChecking} role="status">Checking administrator access…</main>}><AdminShellContent active={active}>{children}</AdminShellContent></Suspense>
}

function AdminShellContent({ active, children }: AdminShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  useEffect(() => {
    let isMounted = true
    async function verifyAdmin() {
      if (!isMounted) return
      try {
        await requireAdminSession()
      } catch (error) {
        const reason = error instanceof Error && error.message.includes('administrator role') ? 'unauthorized' : ''
        if (reason) await supabase.auth.signOut()
        if (!isMounted) return
        const requestedPath = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`
        router.replace(reason ? '/admin/login?reason=unauthorized' : `/admin/login?next=${encodeURIComponent(requestedPath)}`)
        return
      }
      setIsAuthorized(true)
    }
    verifyAdmin()
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/admin/login')
    })
    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [pathname, router, searchParams])

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/admin/login')
  }

  useEffect(() => {
    if (!isMobileNavOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileNavOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isMobileNavOpen])

  if (!isAuthorized) return <main className={styles.authChecking} role="status">Checking administrator access…</main>

  return (
    <div className={styles.shell}>
      {isMobileNavOpen && <button type="button" className={styles.mobileNavBackdrop} aria-label="Close admin navigation" onClick={() => setIsMobileNavOpen(false)} />}
      <aside className={`${styles.sidebar} ${isMobileNavOpen ? styles.sidebarOpen : ''}`} aria-hidden={!isMobileNavOpen && undefined}>
        <Link href="/admin" className={styles.brand}>
          <img src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" />
          <span className={styles.brandCopy}><strong>Admin</strong><span>Management area</span></span>
        </Link>
        <nav id="admin-navigation" className={styles.nav} aria-label="Admin navigation">
          <Link href="/admin" data-active={active === 'dashboard'} onClick={() => setIsMobileNavOpen(false)}>Dashboard</Link>
          <Link href="/admin/products" data-active={active === 'products'} onClick={() => setIsMobileNavOpen(false)}>Products</Link>
          <Link href="/admin/orders" data-active={active === 'orders'} onClick={() => setIsMobileNavOpen(false)}>Orders</Link>
          <Link href="/admin/appointments" data-active={active === 'appointments'} onClick={() => setIsMobileNavOpen(false)}>Appointments</Link>
        </nav>
        <div className={styles.sidebarFooter}>Signed in as an authorized administrator.</div>
      </aside>
      <main className={styles.main}>
        <div className={styles.topbar}><div><p>Hydro Blasters MNL</p><strong>Admin dashboard</strong></div><div className={styles.topbarActions}><button type="button" className={styles.signOutButton} onClick={signOut}>Sign out</button><button type="button" className={styles.menuButton} aria-label={isMobileNavOpen ? 'Close admin navigation' : 'Open admin navigation'} aria-expanded={isMobileNavOpen} aria-controls="admin-navigation" onClick={() => setIsMobileNavOpen((current) => !current)}>☰</button></div></div>
        <AdminDebugPanel />
        {children}
      </main>
    </div>
  )
}
