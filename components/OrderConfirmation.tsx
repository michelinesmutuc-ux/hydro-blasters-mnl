'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Order = Record<string, unknown>
const peso = (value: unknown) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value ?? 0))

export function OrderConfirmation() {
  const [order, setOrder] = useState<Order | null>(null)
  useEffect(() => { try { setOrder(JSON.parse(sessionStorage.getItem('hydro-order-confirmation') ?? 'null')) } catch {} }, [])

  if (!order) return <section className="section"><h1>Order confirmation unavailable</h1><p>Please contact Hydro Blasters MNL if you need help with an order.</p></section>

  const isCod = order.payment_method === 'cash_on_delivery'
  return <section className="section order-confirmation">
    <p className="eyebrow">Order submitted</p>
    <h1>Thank you, {String(order.customer_name)}</h1>
    <p>Order reference: <strong>{String(order.order_reference)}</strong></p>
    <p>Delivery: {String(order.delivery_method).replaceAll('_', ' ')}</p>
    <p>Payment: {String(order.payment_method).replaceAll('_', ' ')}</p>
    <p>Payment status: Pending Verification</p>
    {isCod ? <div className="confirmation-cod-summary"><p><span>Amount Due Now</span><strong>{peso(order.upfront_amount)}</strong></p><p><span>Amount Due to Rider</span><strong>{peso(order.rider_collectible_amount)}</strong></p><p><span>Overall Order Total</span><strong>{peso(order.overall_total)}</strong></p></div> : <p>Amount Due Now: <strong>{peso(order.upfront_amount)}</strong></p>}
    <p>{isCod ? 'Your order will be processed after the Amount Due Now has been paid and verified.' : 'Payment verification may take up to 24 hours. If your payment has not yet been verified after 24 hours, you may follow up through the Facebook account: Hydro Blasters MNL.'}</p>
    <Link className="primary-button" href="/shop">Continue shopping</Link>
  </section>
}
