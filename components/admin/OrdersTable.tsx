'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { requireAdminSession } from '../../lib/admin/auth'
import styles from './admin.module.css'

type Order = {
  id: string
  order_reference: string
  customer_name: string
  mobile_number: string
  delivery_method: string
  payment_method: string
  selected_payment_option_name: string | null
  upfront_amount: number | string
  rider_collectible_amount: number | string
  showroom_payable_amount: number | string
  payment_status: string
  order_status: string
  payment_proof_path: string | null
  telegram_notification_status: 'pending' | 'sent' | 'failed'
  telegram_notification_attempted_at: string | null
  created_at: string
  order_notes: string | null
}

export function OrdersTable() {
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null)

  async function load() {
    const { data, error: loadError } = await supabase
      .from('orders')
      .select('id,order_reference,customer_name,mobile_number,delivery_method,payment_method,selected_payment_option_name,upfront_amount,rider_collectible_amount,showroom_payable_amount,payment_status,order_status,payment_proof_path,telegram_notification_status,telegram_notification_attempted_at,created_at,order_notes')
      .order('created_at', { ascending: false })
    if (loadError) setError(loadError.message)
    else setOrders((data ?? []) as Order[])
  }

  useEffect(() => { void load() }, [])

  async function proof(path: string) {
    const candidatePaths = [...new Set([path, path.replace(/^payment-proofs\//, '')])]
    let lastError: { message: string } | null = null

    for (const candidatePath of candidatePaths) {
      const { data, error: proofError } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(candidatePath, 60)
      if (!proofError && data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
        return
      }
      lastError = proofError
    }

    setError(lastError?.message ?? 'Payment proof could not be found.')
  }

  async function update(order: Order, field: 'payment_status' | 'order_status', value: string) {
    try {
      await requireAdminSession()
      const { error: updateError } = await supabase
        .from('orders')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', order.id)
      if (updateError) throw updateError
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Order update failed.')
    }
  }

  async function retryTelegram(order: Order) {
    setError(null)
    setRetryingOrderId(order.id)
    try {
      await requireAdminSession()
      const { error: resetError } = await supabase
        .from('orders')
        .update({
          telegram_notification_status: 'pending',
          telegram_notification_attempted_at: null,
          telegram_notification_error: null,
        })
        .eq('id', order.id)
        .in('telegram_notification_status', ['failed', 'pending'])
      if (resetError) throw resetError

      const { data, error: invokeError } = await supabase.functions.invoke('notify-new-order', {
        body: { orderId: order.id },
      })
      if (invokeError) throw invokeError
      if (data?.error) throw new Error(data.error)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Telegram notification could not be retried.')
      await load()
    } finally {
      setRetryingOrderId(null)
    }
  }

  return <section className={styles.panel}>
    <div className={styles.panelHeader}><h2>Orders</h2><span>{orders.length} orders</span></div>
    {error && <p className={styles.errorMessage}>{error}</p>}
    <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>Reference</th><th>Customer</th><th>Delivery</th><th>Payment</th><th>Amounts</th><th>Status</th><th>Proof</th></tr></thead>
      <tbody>{orders.map((order) => {
        const notificationMayBeRetried = order.telegram_notification_status === 'failed' || (
          order.telegram_notification_status === 'pending' &&
          (!order.telegram_notification_attempted_at || Date.now() - new Date(order.telegram_notification_attempted_at).getTime() > 30_000)
        )

        return <tr key={order.id}>
        <td>{order.order_reference}</td>
        <td>{order.customer_name}<br />{order.mobile_number}</td>
        <td>{order.delivery_method.replaceAll('_', ' ')}</td>
        <td>{order.payment_method.replaceAll('_', ' ')}{order.selected_payment_option_name && <><br />Bank selected: {order.selected_payment_option_name}</>}</td>
        <td>Amount due now ₱{order.upfront_amount}<br />Rider/showroom ₱{Number(order.rider_collectible_amount) || Number(order.showroom_payable_amount)}</td>
        <td>
          <select value={order.payment_status} onChange={(event) => void update(order, 'payment_status', event.target.value)}><option value="pending_verification">Pending verification</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select>
          <select value={order.order_status} onChange={(event) => void update(order, 'order_status', event.target.value)}><option value="pending">Pending</option><option value="reservation_pending">Reservation pending</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select>
          <span className={styles.status}>Telegram {order.telegram_notification_status}</span>
          {notificationMayBeRetried && <button className={`${styles.tableAction} ${styles.retryNotificationAction}`} type="button" disabled={retryingOrderId === order.id} onClick={() => void retryTelegram(order)}>{retryingOrderId === order.id ? 'Retrying…' : 'Retry Telegram'}</button>}
        </td>
        <td>{order.payment_proof_path ? <button className={styles.tableAction} type="button" onClick={() => void proof(order.payment_proof_path!)}>View proof</button> : '—'}</td>
      </tr>
      })}</tbody>
    </table></div>
  </section>
}
