import { AdminShell } from '../../../../components/admin/AdminShell'
import { ProductForm } from '../../../../components/admin/ProductForm'
import styles from '../../../../components/admin/admin.module.css'

export default function EditProductPage() {
  return <AdminShell active="products"><div className={styles.page}><div className={styles.pageHeader}><div><p className={styles.eyebrow}>Catalogue</p><h1>Edit product</h1><p className={styles.pageIntro}>This reusable form is ready to receive an existing product when data loading is added.</p></div></div><ProductForm mode="edit" /></div></AdminShell>
}
