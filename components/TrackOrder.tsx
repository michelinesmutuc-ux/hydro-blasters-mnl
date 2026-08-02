'use client'

import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'

type Item = { product_name: string; quantity: number; line_total: number }
type Order = { id: string; order_reference: string; customer_name: string; mobile_number: string; city_municipality: string | null; delivery_method: string; payment_method: string; merchandise_subtotal: number; shipping_fee: number; cod_service_fee: number; upfront_amount: number; rider_collectible_amount: number; overall_total: number; payment_status: string; order_status: string; created_at: string; items?: Item[] }
const peso = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
const maskMobile = (value: string) => value.length > 4 ? `${value.slice(0, 4)}•••${value.slice(-4)}` : 'Not provided'
const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const normalizeOrderReference = (value: string) => value.trim().replace(/^#\s*/, '').toUpperCase()

function timeline(order: Order) {
  const pickup = order.delivery_method === 'showroom_pickup'; const status = order.order_status
  const stages = ['Order Received', 'Payment Pending Verification', 'Payment Verified', 'Preparing Order', 'Packed', pickup ? 'Ready for Pickup' : 'Shipped', pickup ? 'Completed' : 'Delivered']
  let current = 1
  if (order.payment_status === 'verified') current = 2
  if (status === 'confirmed') current = 3
  if (status === 'packed') current = 4
  if (status === 'shipped' || status === 'ready_for_pickup') current = 5
  if (status === 'delivered' || status === 'completed') current = 6
  if (status === 'cancelled') return ['Order Received', 'Cancelled'].map((name, index) => ({ name, state: index === 1 ? 'current' : 'completed' }))
  return stages.map((name, index) => ({ name, state: index < current ? 'completed' : index === current ? 'current' : 'upcoming' }))
}

export function TrackOrder() {
  const [reference, setReference] = useState(''); const [surname, setSurname] = useState(''); const [mobile, setMobile] = useState(''); const [order, setOrder] = useState<Order | null>(null); const [matches, setMatches] = useState<Pick<Order, 'id' | 'order_reference' | 'created_at' | 'order_status' | 'overall_total'>[]>([]); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false)
  async function search(body: Record<string, string>) {
    const request = body.mode === 'reference' ? { ...body, orderNumber: normalizeOrderReference(body.orderNumber) } : body
    setLoading(true); setError(null); setOrder(null); setMatches([])
    const { data, error: invokeError } = await supabase.functions.invoke('track-order', { body: request })
    setLoading(false)

    if (invokeError) { setError('Order tracking is temporarily unavailable. Please try again shortly.'); return }
    if (data?.error) {
      setError(data.error === 'No matching order found.' ? data.error : 'Order tracking is temporarily unavailable. Please try again shortly.')
      return
    }
    if (data?.orders) { setMatches(data.orders); return }
    if (data?.order) setOrder(data.order as Order)
    else setError('Order tracking is temporarily unavailable. Please try again shortly.')
  }
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('order')
    if (!fromUrl) return
    const normalizedReference = normalizeOrderReference(fromUrl)
    setReference(normalizedReference)
    void search({ mode: 'reference', orderNumber: normalizedReference })
  }, [])
  return <section className="section track-order-page"><p className="eyebrow">Order tracking</p><h1>Track Your Order</h1><p className="track-intro">Use your order number, or find recent orders using your last name and mobile number.</p><div className="track-search-grid"><form onSubmit={(event: FormEvent) => { event.preventDefault(); void search({ mode: 'reference', orderNumber: reference }) }}><h2>Track by Order Number</h2><label>Order Number<input required value={reference} onChange={(event) => setReference(event.target.value)} placeholder="HBMNL-260802-351120" /></label><button className="primary-button" disabled={loading} type="submit">Track Order</button></form><form onSubmit={(event: FormEvent) => { event.preventDefault(); void search({ mode: 'customer', surname, mobileNumber: mobile }) }}><h2>Forgot your order number?</h2><label>Last Name<input required value={surname} onChange={(event) => setSurname(event.target.value)} /></label><label>Mobile Number<input required inputMode="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="09171234567" /></label><button className="secondary-button" disabled={loading} type="submit">Find My Orders</button></form></div>{loading && <p role="status" className="track-feedback">Loading your order status…</p>}{error && <p role="alert" className="track-feedback">{error}</p>}{matches.length > 0 && <section className="track-matches"><h2>Matching Orders</h2>{matches.map((match) => <button key={match.id} type="button" onClick={() => void search({ mode: 'reference', orderNumber: match.order_reference })}><span><strong>{match.order_reference}</strong><small>{new Date(match.created_at).toLocaleDateString('en-PH')} · {label(match.order_status)}</small></span><span>{peso(match.overall_total)}<small>View Order Status</small></span></button>)}</section>}{order && <article className="track-result"><h2>{order.order_reference}</h2><p>Ordered {new Date(order.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</p><dl><div><dt>Customer Name</dt><dd>{order.customer_name}</dd></div><div><dt>Mobile Number</dt><dd>{maskMobile(order.mobile_number)}</dd></div><div><dt>City / Municipality</dt><dd>{order.city_municipality || 'Not provided'}</dd></div><div><dt>Payment Method</dt><dd>{label(order.payment_method)}</dd></div></dl><h3>Items</h3>{(order.items ?? []).map((item) => <div className="track-item" key={item.product_name}><span>{item.product_name}<small>Qty: {item.quantity}</small></span><strong>{peso(item.line_total)}</strong></div>)}<dl className="track-amounts"><div><dt>Amount Due Now</dt><dd>{peso(order.upfront_amount)}</dd></div>{order.rider_collectible_amount > 0 && <div><dt>Amount Due to Rider</dt><dd>{peso(order.rider_collectible_amount)}</dd></div>}<div><dt>Overall Order Value</dt><dd>{peso(order.overall_total)}</dd></div></dl><h3>Order Progress</h3><ol className="track-timeline">{timeline(order).map((stage) => <li className={stage.state} key={stage.name}><span aria-hidden="true" />{stage.name}<small>{stage.state === 'current' ? 'Current status' : stage.state === 'completed' ? 'Completed' : 'Upcoming'}</small></li>)}</ol></article>}</section>
}
