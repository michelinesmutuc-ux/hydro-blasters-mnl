import { AdminShell } from '../../../components/admin/AdminShell'
import { OrdersTable } from '../../../components/admin/OrdersTable'
import styles from '../../../components/admin/admin.module.css'
export default function Page(){return <AdminShell active="orders"><div className={styles.page}><div className={styles.pageHeader}><div><p className={styles.eyebrow}>Orders</p><h1>Guest orders</h1><p className={styles.pageIntro}>Review payments and reservation requests.</p></div></div><OrdersTable/></div></AdminShell>}
