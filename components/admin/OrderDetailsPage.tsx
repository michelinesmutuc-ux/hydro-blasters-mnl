'use client'

import { useSearchParams } from 'next/navigation'
import { OrderDetails } from './OrderDetails'
import styles from './admin.module.css'

export function OrderDetailsPage() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')
  if (!orderId) return <p className={styles.errorMessage} role="alert">Choose an order from Admin Orders to view its details.</p>
  return <OrderDetails orderId={orderId} />
}
