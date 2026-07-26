import { Suspense } from 'react'
import { AdminLogin } from '../../../components/admin/AdminLogin'
import styles from '../../../components/admin/admin.module.css'

export default function AdminLoginPage() {
  return <Suspense fallback={<main className={styles.authChecking}>Loading sign in…</main>}><AdminLogin /></Suspense>
}
