'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase/client'
import styles from './admin.module.css'

type AdminShellProps = {
  active: 'dashboard' | 'products'
  children: React.ReactNode
}

export function AdminShell({ active, children }: AdminShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    let isMounted = true
    async function verifyAdmin() {
      const { data, error } = await supabase.auth.getUser()
      if (!isMounted) return
      if (error || !data.user) {
        router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`)
        return
      }
      if (data.user.app_metadata?.role !== 'admin') {
        await supabase.auth.signOut()
        if (isMounted) router.replace('/admin/login?reason=unauthorized')
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
  }, [pathname, router])

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/admin/login')
  }

  if (!isAuthorized) return <main className={styles.authChecking} role="status">Checking administrator access…</main>

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/admin" className={styles.brand}>
          <img src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" />
          <span className={styles.brandCopy}><strong>Admin</strong><span>Management area</span></span>
        </Link>
        <nav className={styles.nav} aria-label="Admin navigation">
          <Link href="/admin" data-active={active === 'dashboard'}>Dashboard</Link>
          <Link href="/admin/products" data-active={active === 'products'}>Products</Link>
        </nav>
        <div className={styles.sidebarFooter}>Signed in as an authorized administrator.</div>
      </aside>
      <main className={styles.main}>
        <div className={styles.topbar}><div><p>Hydro Blasters MNL</p><strong>Admin dashboard</strong></div><div className={styles.topbarActions}><button type="button" className={styles.signOutButton} onClick={signOut}>Sign out</button><button type="button" className={styles.menuButton} aria-label="Admin navigation">☰</button></div></div>
        {children}
      </main>
    </div>
  )
}
