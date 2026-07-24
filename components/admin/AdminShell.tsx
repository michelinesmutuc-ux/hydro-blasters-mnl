import Link from 'next/link'
import styles from './admin.module.css'

type AdminShellProps = {
  active: 'dashboard' | 'products'
  children: React.ReactNode
}

export function AdminShell({ active, children }: AdminShellProps) {
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
        <div className={styles.sidebarFooter}>Authentication will be added before this area is used for live product management.</div>
      </aside>
      <main className={styles.main}>
        <div className={styles.topbar}><div><p>Hydro Blasters MNL</p><strong>Admin dashboard</strong></div><button type="button" className={styles.menuButton} aria-label="Admin navigation">☰</button></div>
        {children}
      </main>
    </div>
  )
}
