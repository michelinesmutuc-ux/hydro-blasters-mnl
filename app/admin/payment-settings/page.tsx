import { AdminShell } from '../../../components/admin/AdminShell'
import { PaymentSettings } from '../../../components/admin/PaymentSettings'
import styles from '../../../components/admin/admin.module.css'

export default function PaymentSettingsPage() {
  return <AdminShell active="payment-settings">
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Checkout</p>
          <h1>Payment settings</h1>
          <p className={styles.pageIntro}>Set the public QR image and masked recipient details for each payment method. Never enter a full mobile or bank account number here.</p>
        </div>
      </div>
      <PaymentSettings />
    </div>
  </AdminShell>
}
