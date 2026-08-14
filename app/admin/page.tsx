import Link from 'next/link'
import { AdminShell } from '../../components/admin/AdminShell'
import { StatCard } from '../../components/admin/StatCard'
import { RecentOrders } from '../../components/admin/RecentOrders'
import styles from '../../components/admin/admin.module.css'

export default function AdminDashboardPage() {
  return (
    <AdminShell active="dashboard">
      <div className={styles.page}>
        <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Overview</p><h1>Dashboard</h1><p className={styles.pageIntro}>Product management placeholders will connect to Supabase in a future step.</p></div></div>
        <div className={styles.statGrid}><StatCard label="Total products" /><StatCard label="New arrivals" /><StatCard label="Out of stock" /><StatCard label="Draft products" /></div>
        <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Recent orders</h2><span>Open an order to review its complete details.</span></div><Link className={styles.secondaryButton} href="/admin/orders">All Orders</Link></div><RecentOrders /></section>
        <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Product management</h2><span>Start building your catalogue when product data is ready.</span></div><Link className={styles.primaryButton} href="/admin/products/new">Add product →</Link></div><div className={styles.emptyState}>No product data is loaded yet.</div></section>
      </div>
    </AdminShell>
  )
}
