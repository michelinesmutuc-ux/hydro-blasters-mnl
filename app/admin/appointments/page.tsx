import { AdminShell } from '../../../components/admin/AdminShell'
import { AppointmentsTable } from '../../../components/admin/AppointmentsTable'
import styles from '../../../components/admin/admin.module.css'
export default function Page(){return <AdminShell active="appointments"><div className={styles.page}><div className={styles.pageHeader}><div><p className={styles.eyebrow}>Showroom</p><h1>Appointments</h1><p className={styles.pageIntro}>Review showroom visit requests and update their status.</p></div></div><AppointmentsTable/></div></AdminShell>}
