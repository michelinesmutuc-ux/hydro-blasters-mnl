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
  telegram_notification_type: 'photo' | 'text-fallback' | 'text' | 'failed' | null
  telegram_notification_attempted_at: string | null
  telegram_notification_sent_at: string | null
  telegram_notification_error: string | null
  is_test_order: boolean
  archived_at: string | null
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
  storageError: string | null
  authenticatedUserId: string | null
  appMetadataRole: string | null
  message: string
}

function isValidStoredProofPath(storedPath: string) {
  const normalizedPath = storedPath.trim()
  return Boolean(normalizedPath) && !/^https?:\/\//i.test(normalizedPath) && !normalizedPath.startsWith('/')
}

async function findMatchingProofObjects(order: Order, storedPath: string) {
  const fileName = storedPath.split('/').pop()
  if (!fileName) return { paths: [] as string[], errors: [] as string[] }

  const storedFolder = storedPath.split('/').slice(0, -1).join('/')
  const folders = [...new Set([
    storedFolder,
    `orders/${order.order_reference}`,
    `payment-proofs/${order.order_reference}`,
    `payment-proofs/orders/${order.order_reference}`,
  ].filter(Boolean))]

  const listings = await Promise.all(folders.map(async (folder) => {
    const { data, error } = await supabase.storage.from('payment-proofs').list(folder, { limit: 100 })
    return {
      paths: (data ?? [])
        .filter((object) => object.name === fileName)
        .map((object) => `${folder}/${object.name}`),
      error: error?.message ?? null,
    }
  }))

  return {
    paths: [...new Set(listings.flatMap((listing) => listing.paths))],
    errors: [...new Set(listings.map((listing) => listing.error).filter((error): error is string => Boolean(error)))],
  }
}

export function OrdersTable() {
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null)
  const [telegramFeedback, setTelegramFeedback] = useState<string | null>(null)
  const [orderFilter, setOrderFilter] = useState<'active' | 'archived' | 'test'>('active')
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null)
  const [proofDiagnostics, setProofDiagnostics] = useState<Record<string, ProofDiagnostic>>({})

  async function load() {
    let query = supabase
      .from('orders')
      .select('id,order_reference,customer_name,mobile_number,delivery_method,payment_method,selected_payment_option_name,upfront_amount,rider_collectible_amount,showroom_payable_amount,payment_status,order_status,payment_proof_path,telegram_notification_status,telegram_notification_type,telegram_notification_attempted_at,telegram_notification_sent_at,telegram_notification_error,is_test_order,archived_at,created_at,order_notes')
      .order('created_at', { ascending: false })
    if (orderFilter === 'active') query = query.is('archived_at', null)
    if (orderFilter === 'archived') query = query.not('archived_at', 'is', null)
    if (orderFilter === 'test') query = query.eq('is_test_order', true)
    const { data, error: loadError } = await query
    if (loadError) {
      setError(loadError.message)
      return
    }

    const rows = (data ?? []) as Order[]
    setOrders(rows)
  }

  useEffect(() => { void load() }, [orderFilter])

  async function proof(order: Order) {
    const storedPath = order.payment_proof_path?.trim() ?? ''
    let session
    try {
      session = await requireAdminSession()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No authenticated administrator session was found.'
      setProofDiagnostics((current) => ({ ...current, [order.id]: {
        orderId: order.id,
        orderReference: order.order_reference,
        storedPath,
        bucket: 'payment-proofs',
        lookupPaths: [storedPath || 'None'],
        matchingObjects: [],
        objectExists: false,
        signedUrl: null,
        storageError: message,
        authenticatedUserId: null,
        appMetadataRole: null,
        message: 'Storage access was not attempted because the admin session is unavailable.',
      } }))
      setError(message)
      return
    }

    const authenticatedUserId = session.user.id
    const appMetadataRole = typeof session.user.app_metadata?.role === 'string' ? session.user.app_metadata.role : null
    if (!isValidStoredProofPath(storedPath)) {
      setProofDiagnostics((current) => ({ ...current, [order.id]: {
        orderId: order.id,
        orderReference: order.order_reference,
        storedPath,
        bucket: 'payment-proofs',
        lookupPaths: [storedPath || 'None'],
        matchingObjects: [],
        objectExists: false,
        signedUrl: null,
        storageError: null,
        authenticatedUserId,
        appMetadataRole,
        message: 'Stored payment-proof path is invalid.',
      } }))
      setError('Stored payment-proof path is invalid.')
      return
    }

    console.info('Payment proof link request.', { orderId: order.id, orderReference: order.order_reference, bucket: 'payment-proofs', storedPath, lookupPath: storedPath, authenticatedUserId, appMetadataRole })
    const { data: exactSignedProof, error: exactProofError } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(storedPath, 60)

    if (!exactProofError && exactSignedProof?.signedUrl) {
      setProofDiagnostics((current) => ({ ...current, [order.id]: {
        orderId: order.id,
        orderReference: order.order_reference,
        storedPath,
        bucket: 'payment-proofs',
        lookupPaths: [storedPath],
        matchingObjects: [storedPath],
        objectExists: true,
        signedUrl: exactSignedProof.signedUrl,
        storageError: null,
        authenticatedUserId,
        appMetadataRole,
        message: 'Proof object found at the stored path.',
      } }))
      window.open(exactSignedProof.signedUrl, '_blank', 'noopener,noreferrer')
      return
    }

    const matchingLookup = await findMatchingProofObjects(order, storedPath)
    const matchingObjects = matchingLookup.paths
    const storageError = [exactProofError?.message, ...matchingLookup.errors].filter(Boolean).join(' | ') || null
    if (matchingObjects.length === 1) {
      const repairedPath = matchingObjects[0]
      const { error: repairError } = await supabase
        .from('orders')
        .update({ payment_proof_path: repairedPath, updated_at: new Date().toISOString() })
        .eq('id', order.id)
      if (!repairError) {
        const { data: repairedSignedProof, error: repairedProofError } = await supabase.storage
          .from('payment-proofs')
          .createSignedUrl(repairedPath, 60)
        if (!repairedProofError && repairedSignedProof?.signedUrl) {
          setProofDiagnostics((current) => ({ ...current, [order.id]: {
            orderId: order.id,
            orderReference: order.order_reference,
            storedPath: repairedPath,
            bucket: 'payment-proofs',
            lookupPaths: [storedPath, repairedPath],
            matchingObjects,
            objectExists: true,
            signedUrl: repairedSignedProof.signedUrl,
            storageError: null,
            authenticatedUserId,
            appMetadataRole,
            message: 'Proof object found under a legacy path. The saved database path was repaired.',
          } }))
          await load()
          window.open(repairedSignedProof.signedUrl, '_blank', 'noopener,noreferrer')
          return
        }
      }
    }

    setProofDiagnostics((current) => ({ ...current, [order.id]: {
      orderId: order.id,
      orderReference: order.order_reference,
      storedPath,
      bucket: 'payment-proofs',
      lookupPaths: [storedPath],
      matchingObjects,
      objectExists: false,
      signedUrl: null,
      storageError,
      authenticatedUserId,
      appMetadataRole,
      message: storageError ? 'Storage access failed. See the exact error below.' : matchingObjects.length > 1 ? 'More than one matching proof file was found. The saved path was not changed.' : 'No matching proof object was found.',
    } }))
    console.warn('Payment proof link failed.', { orderId: order.id, orderReference: order.order_reference, bucket: 'payment-proofs', objectPath: storedPath, message: storageError ?? 'No signed URL returned.', matchingObjects, authenticatedUserId, appMetadataRole })
    setError(storageError ? `Storage error: ${storageError}` : matchingObjects.length > 1 ? 'More than one matching proof file was found. See admin diagnostics.' : 'No matching proof object was found.')
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

  async function resendTelegram(order: Order) {
    setError(null)
    setTelegramFeedback(null)
    setRetryingOrderId(order.id)
    try {
      await requireAdminSession()
      console.info('Resend Telegram requested.', { orderId: order.id, orderReference: order.order_reference, hasProofPath: Boolean(order.payment_proof_path), functionName: 'notify-new-order' })
      const { data, error: invokeError } = await supabase.functions.invoke('notify-new-order', {
        body: { orderId: order.id, resend: true },
      })
      if (invokeError) {
        const response = (invokeError as { context?: Response }).context
        const responseBody = response ? await response.clone().json().catch(() => null) as { error?: unknown } | null : null
        const safeMessage = typeof responseBody?.error === 'string'
          ? responseBody.error
          : 'Notification failed. See admin diagnostics.'
        console.error('Resend Telegram function failed.', { orderId: order.id, orderReference: order.order_reference, functionName: 'notify-new-order', httpStatus: response?.status ?? null, message: safeMessage })
        throw new Error(safeMessage)
      }
      if (data?.error) throw new Error(data.error)
      console.info('Resend Telegram function completed.', { orderId: order.id, orderReference: order.order_reference, functionName: 'notify-new-order', notificationType: data?.notificationType ?? 'unknown', response: data?.message ?? 'No message returned.' })
      setTelegramFeedback(typeof data?.message === 'string' ? data.message : 'Telegram notification sent.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Telegram notification could not be sent.')
      await load()
    } finally {
      setRetryingOrderId(null)
    }
  }

  async function setOrderFlag(order: Order, changes: Partial<Pick<Order, 'is_test_order' | 'archived_at'>>) {
    setError(null)
    try {
      await requireAdminSession()
      const { error: updateError } = await supabase.from('orders').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', order.id)
      if (updateError) throw updateError
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Order could not be updated.')
    }
  }

  async function deleteTestOrder() {
    if (!deleteTarget || deleteConfirmation !== 'DELETE') return
    setError(null)
    setDeletingOrderId(deleteTarget.id)
    try {
      await requireAdminSession()
      const { data: currentOrder, error: orderError } = await supabase
        .from('orders')
        .select('id,order_reference,is_test_order,payment_proof_path')
        .eq('id', deleteTarget.id)
        .single()
      if (orderError || !currentOrder) throw new Error('The test order could not be loaded.')
      if (!currentOrder.is_test_order) throw new Error('Only orders explicitly marked as test orders can be deleted.')

      const { error: itemLoadError } = await supabase.from('order_items').select('id,product_id,quantity').eq('order_id', currentOrder.id)
      if (itemLoadError) throw itemLoadError

      let proofWarning: string | null = null
      if (currentOrder.payment_proof_path && isValidStoredProofPath(currentOrder.payment_proof_path)) {
        const { error: proofDeleteError } = await supabase.storage.from('payment-proofs').remove([currentOrder.payment_proof_path])
        if (proofDeleteError) proofWarning = `Payment proof could not be removed: ${proofDeleteError.message}`
      }

      const { error: itemsDeleteError } = await supabase.from('order_items').delete().eq('order_id', currentOrder.id)
      if (itemsDeleteError) throw itemsDeleteError
      const { error: deleteError } = await supabase.from('orders').delete().eq('id', currentOrder.id).eq('is_test_order', true)
      if (deleteError) throw deleteError

      setDeleteTarget(null)
      setDeleteConfirmation('')
      setTelegramFeedback(proofWarning ? `Test order deleted. ${proofWarning}` : 'Test order permanently deleted.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Test order could not be deleted.')
    } finally {
      setDeletingOrderId(null)
    }
  }

  return <section className={styles.panel}>
    <div className={styles.panelHeader}><h2>Orders</h2><span>{orders.length} orders</span></div>
    <div className={styles.tableActions}><button className={styles.tableAction} type="button" onClick={() => setOrderFilter('active')}>Active</button><button className={styles.tableAction} type="button" onClick={() => setOrderFilter('archived')}>View Archived Orders</button><button className={styles.tableAction} type="button" onClick={() => setOrderFilter('test')}>Test Orders</button></div>
    {error && <p className={styles.errorMessage}>{error}</p>}
    {telegramFeedback && <p className={styles.status}>{telegramFeedback}</p>}
    <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>Reference</th><th>Customer</th><th>Delivery</th><th>Payment</th><th>Amounts</th><th>Status</th><th>Proof</th></tr></thead>
      <tbody>{orders.map((order) => {
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
          <span className={styles.status}>Type {order.telegram_notification_type ?? 'not recorded'}</span>
          <button className={`${styles.tableAction} ${styles.retryNotificationAction}`} type="button" disabled={retryingOrderId === order.id} onClick={() => void resendTelegram(order)}>{retryingOrderId === order.id ? 'Resending…' : 'Resend Telegram Notification'}</button>
          {order.is_test_order ? <><span className={styles.status}>Test Order</span><button className={`${styles.tableAction} ${styles.retryNotificationAction}`} type="button" onClick={() => void setOrderFlag(order, { is_test_order: false })}>Remove Test Order Mark</button><button className={`${styles.tableAction} ${styles.deleteAction} ${styles.retryNotificationAction}`} type="button" onClick={() => { setDeleteConfirmation(''); setDeleteTarget(order) }}>Delete Test Order Permanently</button></> : <button className={`${styles.tableAction} ${styles.retryNotificationAction}`} type="button" onClick={() => void setOrderFlag(order, { is_test_order: true })}>Mark as Test Order</button>}
          {order.archived_at ? <button className={`${styles.tableAction} ${styles.retryNotificationAction}`} type="button" onClick={() => void setOrderFlag(order, { archived_at: null })}>Restore Order</button> : !order.is_test_order && <button className={`${styles.tableAction} ${styles.retryNotificationAction}`} type="button" onClick={() => void setOrderFlag(order, { archived_at: new Date().toISOString() })}>Archive Order</button>}
        </td>
        <td><button className={`${styles.tableAction} ${styles.proofAction}`} type="button" onClick={() => void proof(order)}>View Payment Proof</button>{proofDiagnostic && <details className={styles.proofDiagnostic}><summary>Proof diagnostics</summary><dl><div><dt>Stored path</dt><dd>{proofDiagnostic.storedPath || 'None'}</dd></div><div><dt>Bucket</dt><dd>{proofDiagnostic.bucket}</dd></div><div><dt>Lookup paths</dt><dd>{proofDiagnostic.lookupPaths.join(' · ') || 'None'}</dd></div><div><dt>Object exists</dt><dd>{proofDiagnostic.objectExists ? 'Yes' : 'No'}</dd></div><div><dt>Matching objects</dt><dd>{proofDiagnostic.matchingObjects.join(' · ') || 'None found'}</dd></div><div><dt>Storage error</dt><dd>{proofDiagnostic.storageError || 'None'}</dd></div><div><dt>Authenticated user</dt><dd>{proofDiagnostic.authenticatedUserId || 'No session'}</dd></div><div><dt>Admin role</dt><dd>{proofDiagnostic.appMetadataRole || 'Missing'}</dd></div><div><dt>Signed URL</dt><dd>{proofDiagnostic.signedUrl ? <a href={proofDiagnostic.signedUrl} target="_blank" rel="noreferrer">Open secure proof link</a> : 'Not generated'}</dd></div><div><dt>Result</dt><dd>{proofDiagnostic.message}</dd></div></dl></details>}</td>
      </tr>
      })}</tbody>
    </table></div>
    {deleteTarget && <div className={styles.confirmOverlay} role="dialog" aria-modal="true" aria-labelledby="delete-test-order-title"><div className={styles.confirmDialog}><h3 id="delete-test-order-title">Delete test order permanently?</h3><p><strong>{deleteTarget.order_reference}</strong> — {deleteTarget.customer_name}</p><p>This cannot be undone. Its order items and saved payment proof will be removed. Inventory is not restored because this website does not deduct inventory when an order is placed.</p><label>Type DELETE to continue<input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label><div className={styles.tableActions}><button className={styles.tableAction} type="button" onClick={() => { setDeleteTarget(null); setDeleteConfirmation('') }}>Cancel</button><button className={`${styles.tableAction} ${styles.deleteAction}`} type="button" disabled={deleteConfirmation !== 'DELETE' || deletingOrderId === deleteTarget.id} onClick={() => void deleteTestOrder()}>{deletingOrderId === deleteTarget.id ? 'Deleting…' : 'Delete Test Order Permanently'}</button></div></div></div>}
  </section>
}
