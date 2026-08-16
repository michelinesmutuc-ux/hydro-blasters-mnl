import { AdminShell } from '../../../../components/admin/AdminShell'
import { ProductForm } from '../../../../components/admin/ProductForm'
import styles from '../../../../components/admin/admin.module.css'

const sectionAccentStyles = `
  .${styles.formSection}:has(> .${styles.fieldGrid}) {
    border-color: #72eaff55;
    box-shadow: inset 3px 0 0 #72eaff;
  }
  .${styles.formSection}:has(.${styles.addonPicker}) {
    border-color: #9d75ff55;
    box-shadow: inset 3px 0 0 #9d75ff;
  }
  .${styles.formSection}:has(> .${styles.specificationHeader}):not(:has(> .${styles.field})):not(:has(.${styles.addonPicker})) {
    border-color: #fa55c755;
    box-shadow: inset 3px 0 0 #fa55c7;
  }
  .${styles.formSection}:has(> .${styles.imageUpload}) {
    border-color: #c2aaff55;
    box-shadow: inset 3px 0 0 #c2aaff;
  }
`

export default function EditProductPage() {
  return <AdminShell active="products"><div className={styles.page}><style>{sectionAccentStyles}</style><div className={styles.pageHeader}><div><p className={styles.eyebrow}>Catalogue</p><h1>Edit product</h1><p className={styles.pageIntro}>Update product details and uploaded images.</p></div></div><ProductForm mode="edit" /></div></AdminShell>
}
