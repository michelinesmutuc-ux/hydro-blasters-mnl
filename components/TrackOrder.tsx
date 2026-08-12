'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabase/client'

type Item = { product_name: string; variant_group_name?: string | null; variant_name?: string | null; quantity: number; line_total: number }
type Order = { id: string; order_reference: string; customer_name: string; mobile_number: string; city_municipality: string | null; delivery_method: string; payment_method: string; merchandise_subtotal: number; shipping_fee: number; shipping_tier?: string | null; cod_service_fee: number; upfront_amount: number; rider_collectible_amount: number; overall_total: number; promo_name?: string | null; promo_discount?: number | string; payment_status: string; order_status: string; created_at: string; items?: Item[] }
const peso = (value: number | string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value))
const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
const maskMobile = (value: string) => value.length > 4 ? `${value.slice(0, 4)}•••${value.slice(-4)}` : value

function timeline(order: Order) {
  const paymentVerified = order.payment_status === 'verified'
  const orderStages = ['pending', 'confirmed', 'preparing', 'packed', 'shipped', 'delivered']
  const currentOrderStage = Math.max(orderStages.indexOf(order.order_status), 0)
  return [
    { name: 'Order Received', state: 'completed' },
    { name: paymentVerified ? 'Payment Verified' : 'Payment Pending Verification', state: paymentVerified ? 'completed' : 'current' },
    ...['Preparing Order', 'Packed', order.delivery_method === 'showroom_pickup' ? 'Ready for Pickup' : 'Shipped', 'Delivered'].map((name, index) => ({ name, state: paymentVerified && currentOrderStage >= index + 2 ? 'completed' : paymentVerified && currentOrderStage === index + 1 ? 'current' : 'upcoming' })),
  ]
}

export function TrackOrder() {
  const searchParams = useSearchParams()
  const [reference, setReference] = useState(''); const [surname, setSurname] = useState(''); const [mobile, setMobile] = useState(''); const [order, setOrder] = useState<Order | null>(null); const [matches, setMatches] = useState<Pick<Order, 'id' | 'order_reference' | 'created_at' | 'order_status' | 'overall_total'>[]>([]); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false)
  async function search(request: Record<string, string>) {
    setLoading(true); setError(null); setMatches([]); setOrder(null)
    const { data, error: invokeError } = await supabase.functions.invoke('track-order', { body: request })
    setLoading(false)
    if (invokeError || data?.error) { setError(typeof data?.error === 'string' ? data.error : 'Order tracking is temporarily unavailable. Please try again shortly.'); return }
    if (data?.orders) { setMatches(data.orders); return }
    if (data?.order) setOrder(data.order)
  }
  useEffect(() => { const requested = searchParams.get('order'); if (requested) { setReference(requested); void search({ mode: 'reference', orderNumber: requested }) } }, [searchParams])
  return <section className="section track-order-page"><p className="eyebrow">Order tracking</p><h1>Track Your Order</h1><p className="track-intro">Use your order number, or find recent orders using your last name and mobile number.</p><div className="track-search-grid"><form onSubmit={(event: FormEvent) => { event.preventDefault(); void search({ mode: 'reference', orderNumber: reference }) }}><h2>Track by Order Number</h2><label>Order Number<input required value={reference} onChange={(event) => setReference(event.target.value)} placeholder="HBMNL-260802-351120" /></label><button className="primary-button" disabled={loading} type="submit">Track Order</button></form><form onSubmit={(event: FormEvent) => { event.preventDefault(); void search({ mode: 'customer', surname, mobileNumber: mobile }) }}><h2>Forgot your order number?</h2><label>Last Name<input required value={surname} onChange={(event) => setSurname(event.target.value)} /></label><label>Mobile Number<input required inputMode="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="09171234567" /></label><button className="secondary-button" disabled={loading} type="submit">Find My Orders</button></form></div>{loading && <p role="status" className="track-feedback">Loading your order status…</p>}{error && <p role="alert" className="track-feedback">{error}</p>}{matches.length > 0 && <section className="track-matches"><h2>Matching Orders</h2>{matches.map((match) => <button key={match.id} type="button" onClick={() => void search({ mode: 'reference', orderNumber: match.order_reference })}><span><strong>{match.order_reference}</strong><small>{new Date(match.created_at).toLocaleDateString('en-PH')} · {label(match.order_status)}</small></span><span>{peso(match.overall_total)}<small>View Order Status</small></span></button>)}</section>}{order && <article className="track-result"><h2>{order.order_reference}</h2><p>Ordered {new Date(order.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</p><dl><div><dt>Customer Name</dt><dd>{order.customer_name}</dd></div><div><dt>Mobile Number</dt><dd>{maskMobile(order.mobile_number)}</dd></div><div><dt>City / Municipality</dt><dd>{order.city_municipality || 'Not provided'}</dd></div><div><dt>Payment Method</dt><dd>{label(order.payment_method)}</dd></div></dl><h3>Items</h3>{(order.items ?? []).map((item, index) => <div className="track-item" key={`${item.product_name}-${index}`}><span>{item.product_name}{item.variant_name && <small>{item.variant_group_name || 'Option'}: {item.variant_name}</small>}<small>Qty: {item.quantity}</small></span><strong>{peso(item.line_total)}</strong></div>)}<dl className="track-amounts">{Number(order.promo_discount) > 0 && <div><dt>{order.promo_name || 'Launch Promo'} (10% Off)</dt><dd>−{peso(order.promo_discount!)}</dd></div>}<div><dt>Amount Due Now</dt><dd>{peso(order.upfront_amount)}</dd></div>{order.rider_collectible_amount > 0 && <div><dt>Amount Due to Rider</dt><dd>{peso(order.rider_collectible_amount)}</dd></div>}<div><dt>Overall Order Value</dt><dd>{peso(order.overall_total)}</dd></div></dl><h3>Order Progress</h3><ol className="track-timeline">{timeline(order).map((stage) => <li className={stage.state} key={stage.name}><span aria-hidden="true" />{stage.name}<small>{stage.state === 'current' ? 'Current status' : stage.state === 'completed' ? 'Completed' : 'Upcoming'}</small></li>)}</ol></article>}</section>
}
