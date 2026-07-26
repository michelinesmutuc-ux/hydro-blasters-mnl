import Link from 'next/link'
import { AdminShell } from '../../../components/admin/AdminShell'
import { PublishWebsiteButton } from '../../../components/admin/PublishWebsiteButton'
import { ProductsTable } from '../../../components/admin/ProductsTable'
import styles from '../../../components/admin/admin.module.css'

export default function ProductsPage() {
  return (
    <AdminShell active="products">
      <div className={styles.page}>
        <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Catalogue</p><h1>Products</h1><p className={styles.pageIntro}>Manage products saved in Supabase.</p></div><div className={styles.pageActions}><PublishWebsiteButton /><Link className={styles.primaryButton} href="/admin/products/new">Add product →</Link></div></div>
        <ProductsTable />
      </div>
    </AdminShell>
  )
}
