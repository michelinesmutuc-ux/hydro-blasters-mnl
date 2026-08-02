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

type ProofDiagnostic = {
  orderId: string
  orderReference: string
  storedPath: string
  bucket: string
  lookupPaths: string[]
  matchingObjects: string[]
  objectExists: boolean
  signedUrl: string | null
  message: string
}

function getProofPathCandidates(storedPath: string) {
  const normalizedPath = storedPath.trim()
  if (!normalizedPath || /^https?:\/\//i.test(normalizedPath) || normalizedPath.startsWith('/')) return []
  const innerPath = normalizedPath.replace(/^(?:payment-proofs|payment\/proofs)\//, '')
  return [...new Set([
    normalizedPath,
    innerPath,
    `payment-proofs/${innerPath}`,
    `payment/proofs/${innerPath}`,
  ])]
}

export function OrdersTable() {
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null)
  const [proofDiagnostics, setProofDiagnostics] = useState<Record<string, ProofDiagnostic>>({})

  async function load() {
    const { data, error: loadError } = await supabase
      .from('orders')
      .select('id,order_reference,customer_name,mobile_number,delivery_method,payment_method,selected_payment_option_name,upfront_amount,rider_collectible_amount,showroom_payable_amount,payment_status,order_status,payment_proof_path,telegram_notification_status,telegram_notification_attempted_at,created_at,order_notes')
      .order('created_at', { ascending: false })
    if (loadError) {
      setError(loadError.message)
      return
    }

    const rows = (data ?? []) as Order[]
    setOrders(rows)
  }

  useEffect(() => { void load() }, [])

  async function proof(order: Order) {
    const storedPath = order.payment_proof_path?.trim() ?? ''
    const candidatePaths = getProofPathCandidates(storedPath)
    if (!candidatePaths.length) {
      setProofDiagnostics((current) => ({ ...current, [order.id]: {
        orderId: order.id,
        orderReference: order.order_reference,
        storedPath,
        bucket: 'payment-proofs',
        lookupPaths: [],
        matchingObjects: [],
        objectExists: false,
        signedUrl: null,
        message: 'Stored payment-proof path is invalid.',
      } }))
      setError('Stored payment-proof path is invalid.')
      return
    }

    const foldersToInspect = [...new Set(candidatePaths.map((path) => path.split('/').slice(0, -1).join('/')).filter(Boolean))]
    const objectListings = await Promise.all(foldersToInspect.map(async (folder) => {
      const { data } = await supabase.storage.from('payment-proofs').list(folder, { limit: 100 })
      return (data ?? []).map((object) => `${folder}/${object.name}`)
    }))
    const matchingObjects = objectListings.flat()
    let lastError: { message: string } | null = null
    console.info('Payment proof link request.', { orderId: order.id, orderReference: order.order_reference, bucket: 'payment-proofs', storedPath, candidatePaths })

    for (const candidatePath of candidatePaths) {
      const { data, error: proofError } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(candidatePath, 60)
      if (!proofError && data?.signedUrl) {
        if (candidatePath !== storedPath) {
          const { error: repairError } = await supabase
            .from('orders')
            .update({ payment_proof_path: candidatePath, updated_at: new Date().toISOString() })
            .eq('id', order.id)
          if (repairError) console.warn('Payment proof path repair failed.', { orderId: order.id, message: repairError.message })
        }
        console.info('Payment proof signed link created.', { orderId: order.id, orderReference: order.order_reference, bucket: 'payment-proofs', objectPath: candidatePath })
        setProofDiagnostics((current) => ({ ...current, [order.id]: {
          orderId: order.id,
          orderReference: order.order_reference,
          storedPath,
          bucket: 'payment-proofs',
          lookupPaths: candidatePaths,
          matchingObjects,
          objectExists: true,
          signedUrl: data.signedUrl,
          message: candidatePath === storedPath ? 'Proof object found at the stored path.' : 'Proof object found at an alternate path. The saved path was repaired.',
        } }))
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
        return
      }
      console.warn('Payment proof link failed.', { orderId: order.id, orderReference: order.order_reference, bucket: 'payment-proofs', objectPath: candidatePath, message: proofError?.message ?? 'No signed URL returned.' })
      lastError = proofError
    }

    if (/object not found/i.test(lastError?.message ?? '')) {
      setProofDiagnostics((current) => ({ ...current, [order.id]: {
        orderId: order.id,
        orderReference: order.order_reference,
        storedPath,
        bucket: 'payment-proofs',
        lookupPaths: candidatePaths,
        matchingObjects,
        objectExists: false,
        signedUrl: null,
        message: 'Payment proof was not uploaded successfully for this order.',
      } }))
      setError('Payment proof was not uploaded successfully for this order.')
      return
    }
    setProofDiagnostics((current) => ({ ...current, [order.id]: {
      orderId: order.id,
      orderReference: order.order_reference,
      storedPath,
      bucket: 'payment-proofs',
      lookupPaths: candidatePaths,
      matchingObjects,
      objectExists: false,
      signedUrl: null,
      message: 'Could not generate a secure proof link.',
    } }))
    setError(lastError ? 'Could not generate a secure proof link.' : 'Payment proof file is missing.')
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
      console.info('Retry Telegram requested.', { orderId: order.id, orderReference: order.order_reference, functionName: 'notify-new-order' })
      const { data: requeuedOrder, error: resetError } = await supabase
        .from('orders')
        .update({
          telegram_notification_status: 'pending',
          telegram_notification_attempted_at: null,
          telegram_notification_error: null,
        })
        .eq('id', order.id)
        .in('telegram_notification_status', ['failed', 'pending'])
        .select('id')
        .maybeSingle()
      if (resetError) throw resetError
      if (!requeuedOrder) throw new Error('Telegram notification could not be queued for retry.')

      const { data, error: invokeError } = await supabase.functions.invoke('notify-new-order', {
        body: { orderId: order.id },
      })
      if (invokeError) {
        const response = (invokeError as { context?: Response }).context
        const responseBody = response ? await response.clone().json().catch(() => null) as { error?: unknown } | null : null
        const safeMessage = typeof responseBody?.error === 'string'
          ? responseBody.error
          : 'Notification failed. See admin diagnostics.'
        console.error('Retry Telegram function failed.', { orderId: order.id, orderReference: order.order_reference, functionName: 'notify-new-order', httpStatus: response?.status ?? null, message: safeMessage })
        throw new Error(safeMessage)
      }
      if (data?.error) throw new Error(data.error)
      console.info('Retry Telegram function completed.', { orderId: order.id, orderReference: order.order_reference, functionName: 'notify-new-order', response: data?.message ?? 'No message returned.' })
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
        const proofDiagnostic = proofDiagnostics[order.id]

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
        <td><button className={`${styles.tableAction} ${styles.proofAction}`} type="button" onClick={() => void proof(order)}>View Payment Proof</button>{proofDiagnostic && <details className={styles.proofDiagnostic}><summary>Proof diagnostics</summary><dl><div><dt>Stored path</dt><dd>{proofDiagnostic.storedPath || 'None'}</dd></div><div><dt>Bucket</dt><dd>{proofDiagnostic.bucket}</dd></div><div><dt>Lookup paths</dt><dd>{proofDiagnostic.lookupPaths.join(' · ') || 'None'}</dd></div><div><dt>Object exists</dt><dd>{proofDiagnostic.objectExists ? 'Yes' : 'No'}</dd></div><div><dt>Matching objects</dt><dd>{proofDiagnostic.matchingObjects.join(' · ') || 'None found'}</dd></div><div><dt>Signed URL</dt><dd>{proofDiagnostic.signedUrl ? <a href={proofDiagnostic.signedUrl} target="_blank" rel="noreferrer">Open secure proof link</a> : 'Not generated'}</dd></div><div><dt>Result</dt><dd>{proofDiagnostic.message}</dd></div></dl></details>}</td>
      </tr>
      })}</tbody>
    </table></div>
  </section>
}
