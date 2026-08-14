import { Suspense } from 'react'
import { AdminShell } from '../../../components/admin/AdminShell'
import { OrderDetailsPage } from '../../../components/admin/OrderDetailsPage'
import styles from '../../../components/admin/admin.module.css'

export default function AdminOrderDetailsRoute() {
  return <AdminShell active="orders"><div className={styles.page}><Suspense fallback={<p className={styles.emptyState}>Loading order details…</p>}><OrderDetailsPage /></Suspense></div></AdminShell>
}
