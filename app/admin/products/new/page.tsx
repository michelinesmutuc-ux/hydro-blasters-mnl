import { AdminShell } from '../../../../components/admin/AdminShell'
import { ProductForm } from '../../../../components/admin/ProductForm'
import styles from '../../../../components/admin/admin.module.css'

export default function AddProductPage() {
  return <AdminShell active="products"><div className={styles.page}><div className={styles.pageHeader}><div><p className={styles.eyebrow}>Catalogue</p><h1>Add product</h1><p className={styles.pageIntro}>Add a new product to your catalogue.</p></div></div><ProductForm mode="add" /></div></AdminShell>
}
