import Link from 'next/link'
import { AdminShell } from '../../../components/admin/AdminShell'
import styles from '../../../components/admin/admin.module.css'

const columns = ['Thumbnail', 'Product Name', 'Brand', 'Category', 'Price', 'Stock', 'Status', 'Featured', 'Actions']

export default function ProductsPage() {
  return (
    <AdminShell active="products">
      <div className={styles.page}>
        <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Catalogue</p><h1>Products</h1><p className={styles.pageIntro}>This table is ready for Supabase product data. No records are being fetched yet.</p></div><Link className={styles.primaryButton} href="/admin/products/new">Add product →</Link></div>
        <section className={styles.panel}><div className={styles.panelHeader}><h2>All products</h2><span>Placeholder table</span></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody><tr><td><div className={styles.thumbnail}>Image</div></td><td className={styles.placeholderText}>Product name</td><td className={styles.placeholderText}>—</td><td className={styles.placeholderText}>—</td><td className={styles.placeholderText}>—</td><td className={styles.placeholderText}>—</td><td><span className={styles.status}>Draft</span></td><td className={styles.placeholderText}>—</td><td><Link className={styles.actionLink} href="/admin/products/edit">Edit</Link></td></tr></tbody></table></div></section>
      </div>
    </AdminShell>
  )
}
