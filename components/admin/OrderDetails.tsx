'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { requireAdminSession } from '../../lib/admin/auth'
import { formatCourierAddress, formatFulfillmentAddressLines } from '../../lib/orders/format-fulfillment-address'
import styles from './admin.module.css'

type Order = {
  id: string; order_reference: string; customer_name: string; mobile_number: string
  house_unit: string | null; street: string | null; barangay: string | null; city_municipality: string | null; region: string | null; postal_code: string | null; order_notes: string | null
  delivery_method: string; same_day_processing: string | null; payment_method: string; selected_payment_option_name: string | null
  merchandise_subtotal: number | string; shipping_fee: number | string; shipping_tier: string | null; cod_service_fee: number | string; upfront_amount: number | string; rider_collectible_amount: number | string; showroom_payable_amount: number | string; overall_total: number | string; promo_name: string | null; promo_discount: number | string
  payment_status: string; order_status: string; payment_proof_path: string | null; created_at: string
}
type Item = { product_name: string; variant_group_name: string | null; variant_name: string | null; quantity: number; line_total: number | string }

const peso = (value: number | string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value))
const readable = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const deliveryLabel = (value: string) => value === 'showroom_pickup' ? 'Showroom Pickup' : value === 'same_day_delivery' ? 'Same-Day / On-Demand Delivery' : 'Standard Shipping'

export function OrderDetails({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      await requireAdminSession()
      const { data, error: orderError } = await supabase.from('orders').select('id,order_reference,customer_name,mobile_number,house_unit,street,barangay,city_municipality,region,postal_code,order_notes,delivery_method,same_day_processing,payment_method,selected_payment_option_name,merchandise_subtotal,shipping_fee,shipping_tier,cod_service_fee,upfront_amount,rider_collectible_amount,showroom_payable_amount,overall_total,promo_name,promo_discount,payment_status,order_status,payment_proof_path,created_at').eq('id', orderId).single()
      if (orderError || !data) throw orderError ?? new Error('Order not found.')
      const { data: itemData, error: itemError } = await supabase.from('order_items').select('product_name,variant_group_name,variant_name,quantity,line_total').eq('order_id', orderId)
      if (itemError) throw itemError
      setOrder(data as Order)
      setItems((itemData ?? []) as Item[])
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Order details could not be loaded.') }
  }

  useEffect(() => { void load() }, [orderId])

  async function update(field: 'payment_status' | 'order_status', value: string) {
    if (!order) return
    try {
      await requireAdminSession()
      const { error: updateError } = await supabase.from('orders').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', order.id)
      if (updateError) throw updateError
      await load()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Order status could not be updated.') }
  }

  async function copyShippingDetails() {
    if (!order) return
    try { await navigator.clipboard.writeText(formatCourierAddress(order)); setFeedback('Shipping details copied') } catch { setError('Shipping details could not be copied.') }
  }

  async function viewProof() {
    if (!order?.payment_proof_path) return setError('No payment proof was saved for this order.')
    const { data, error: proofError } = await supabase.storage.from('payment-proofs').createSignedUrl(order.payment_proof_path, 60)
    if (proofError || !data?.signedUrl) return setError(proofError?.message ?? 'Payment proof could not be opened.')
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (error && !order) return <p className={styles.errorMessage} role="alert">{error}</p>
  if (!order) return <p className={styles.emptyState} role="status">Loading order details…</p>
  const addressLines = formatFulfillmentAddressLines(order)
  const isPickup = order.delivery_method === 'showroom_pickup'
  const riderAmount = Number(order.rider_collectible_amount) || Number(order.showroom_payable_amount)

  return <div className={styles.orderDetailsPage}>
    <div className={styles.orderDetailsHeading}><div><p className={styles.eyebrow}>Order details</p><h1>{order.order_reference}</h1><p>{new Date(order.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p></div><Link className={styles.secondaryButton} href="/admin/orders">Back to Orders</Link></div>
    {error && <p className={styles.errorMessage} role="alert">{error}</p>}{feedback && <p className={styles.successMessage} role="status">{feedback}</p>}
    <div className={styles.orderDetailsGrid}>
      <section className={styles.orderDetailCard}><h2>Order</h2><dl><div><dt>Order number</dt><dd>{order.order_reference}</dd></div><div><dt>Order status</dt><dd>{readable(order.order_status)}</dd></div></dl></section>
      <section className={styles.orderDetailCard}><h2>Customer</h2><dl><div><dt>Full name</dt><dd>{order.customer_name}</dd></div><div><dt>Contact number</dt><dd>{order.mobile_number}</dd></div></dl></section>
      <section className={styles.orderDetailCard}><h2>Payment</h2><dl><div><dt>Method</dt><dd>{readable(order.payment_method)}{order.selected_payment_option_name ? ` (${order.selected_payment_option_name})` : ''}</dd></div><div><dt>Payment status</dt><dd><select value={order.payment_status} onChange={(event) => void update('payment_status', event.target.value)}><option value="pending_verification">Pending verification</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select></dd></div></dl>{order.payment_proof_path && <button className={styles.copyAddressAction} type="button" onClick={() => void viewProof()}>View Payment Proof</button>}</section>
      <section className={styles.orderDetailCard}><h2>Fulfillment</h2><dl><div><dt>Delivery method</dt><dd>{deliveryLabel(order.delivery_method)}</dd></div><div><dt>Order status</dt><dd><select value={order.order_status} onChange={(event) => void update('order_status', event.target.value)}><option value="pending">Pending</option><option value="reservation_pending">Reservation pending</option><option value="confirmed">Confirmed</option>{order.delivery_method === 'same_day_delivery' && <option value="ready_for_rider">Ready for Rider</option>}<option value="cancelled">Cancelled</option></select></dd></div></dl>{isPickup ? <p>Showroom pickup — no delivery address was requested.</p> : <><h3>Complete shipping address</h3><address>{addressLines.map((line) => <span key={line}>{line}</span>)}{addressLines.length === 0 && <span>No address details were saved for this older order.</span>}</address>{order.order_notes && <p><strong>Delivery notes:</strong> {order.order_notes}</p>}<button className={styles.copyAddressAction} type="button" onClick={() => void copyShippingDetails()}>Copy Shipping Details</button></>}</section>
    </div>
    <section className={styles.orderDetailCard}><h2>Items ordered</h2><div className={styles.orderItemsList}>{items.map((item, index) => <div key={`${item.product_name}-${index}`}><span><strong>{item.product_name}</strong>{item.variant_name && <small>{item.variant_group_name || 'Option'}: {item.variant_name}</small>}<small>Quantity: {item.quantity}</small></span><b>{peso(item.line_total)}</b></div>)}{items.length === 0 && <p>Item details are unavailable for this older order.</p>}</div></section>
    <section className={styles.orderDetailCard}><h2>Totals</h2><dl className={styles.orderTotals}><div><dt>Merchandise subtotal</dt><dd>{peso(order.merchandise_subtotal)}</dd></div>{Number(order.promo_discount) > 0 && <div><dt>{order.promo_name || 'Launch Promo'} discount</dt><dd>−{peso(order.promo_discount)}</dd></div>}<div><dt>Shipping{order.shipping_tier ? ` — ${order.shipping_tier}` : ''}</dt><dd>{peso(order.shipping_fee)}</dd></div>{Number(order.cod_service_fee) > 0 && <div><dt>COD fee</dt><dd>{peso(order.cod_service_fee)}</dd></div>}<div><dt>Amount due now</dt><dd>{peso(order.upfront_amount)}</dd></div>{riderAmount > 0 && <div><dt>{isPickup ? 'Amount due at showroom' : 'Amount due to rider'}</dt><dd>{peso(riderAmount)}</dd></div>}<div><dt>Overall total</dt><dd>{peso(order.overall_total)}</dd></div></dl></section>
  </div>
}
