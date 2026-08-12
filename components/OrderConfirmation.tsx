'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type ReceiptItem = { name: string; variant_group_name?: string | null; variant_name?: string | null; quantity: number; line_total: number }
type Order = {
  order_reference: string; customer_name: string; mobile_number?: string; city_municipality?: string; order_date?: string; items?: ReceiptItem[]
  merchandise_subtotal: number | string; shipping_fee: number | string; shipping_tier?: string | null; cod_service_fee: number | string; upfront_amount: number | string; rider_collectible_amount: number | string; overall_total: number | string; promo_name?: string | null; promo_discount?: number | string | null
  payment_method: string; delivery_method?: string; payment_status?: string; order_status?: string
}

const peso = (value: number | string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value ?? 0))
const maskMobile = (mobile?: string) => mobile && mobile.length > 4 ? `${mobile.slice(0, 4)}•••${mobile.slice(-4)}` : 'Not provided'
const titleCase = (value?: string) => (value || 'Pending verification').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const deliveryLabel = (order: Order) => order.delivery_method === 'same_day_delivery' ? 'Same-Day / On-Demand Delivery' : titleCase(order.delivery_method)

function downloadReceipt(order: Order) {
  const canvas = document.createElement('canvas'); const width = 1080; const padding = 72
  const items = order.items ?? []; const sameDay = order.delivery_method === 'same_day_delivery'
  const height = Math.max(1180, 790 + items.length * 72 + (sameDay ? 48 : 0))
  canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d'); if (!context) return false
  context.fillStyle = '#101015'; context.fillRect(0, 0, width, height)
  context.strokeStyle = '#72eaff'; context.lineWidth = 3; context.strokeRect(28, 28, width - 56, height - 56)
  let y = padding
  const line = (text: string, size = 28, color = '#f5f4f7', weight = '400') => { context.fillStyle = color; context.font = `${weight} ${size}px Arial`; context.fillText(text, padding, y); y += size + 18 }
  const pair = (label: string, value: string) => { context.fillStyle = '#a09fac'; context.font = '700 20px Arial'; context.fillText(label.toUpperCase(), padding, y); context.fillStyle = '#f5f4f7'; context.font = '700 24px Arial'; context.textAlign = 'right'; context.fillText(value, width - padding, y); context.textAlign = 'left'; y += 46 }
  line('HYDRO BLASTERS MNL', 30, '#72eaff', '700'); line('ORDER RECEIPT', 22, '#a09fac', '700'); y += 12
  pair('Order Number', order.order_reference); pair('Order Date', new Date(order.order_date || Date.now()).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })); pair('Customer', order.customer_name); pair('Mobile', maskMobile(order.mobile_number)); pair('City', order.city_municipality || 'Not provided'); pair('Delivery', deliveryLabel(order))
  line('PURCHASED ITEMS', 20, '#72eaff', '700')
  items.forEach((item) => { line(`${item.name}${item.variant_name ? ` — ${item.variant_name}` : ''}  × ${item.quantity}`, 23); pair('Line subtotal', peso(item.line_total)) })
  pair('Merchandise', peso(order.merchandise_subtotal)); if (Number(order.promo_discount) > 0) pair(`${order.promo_name || 'Launch Promo'} (10% Off)`, `−${peso(order.promo_discount!)}`); pair(sameDay ? 'Website delivery fee' : 'Shipping', peso(order.shipping_fee)); if (Number(order.cod_service_fee) > 0) pair('COD Fee', peso(order.cod_service_fee)); pair('Amount Due Now', peso(order.upfront_amount)); if (Number(order.rider_collectible_amount) > 0) pair('Amount Due to Rider', peso(order.rider_collectible_amount)); pair('Overall Order Value', peso(order.overall_total)); pair('Current Order Status', titleCase(order.order_status || order.payment_status)); if (sameDay) line('Courier fee paid directly to rider.', 18, '#a09fac'); line('Save this receipt to track your order later.', 18, '#a09fac')
  const link = document.createElement('a'); link.download = `hydro-blasters-mnl-${order.order_reference}-receipt.png`; link.href = canvas.toDataURL('image/png'); link.click(); return true
}

export function OrderConfirmation() {
  const [order, setOrder] = useState<Order | null>(null); const [copied, setCopied] = useState(false); const [downloadError, setDownloadError] = useState<string | null>(null)
  useEffect(() => { try { setOrder(JSON.parse(sessionStorage.getItem('hydro-order-confirmation') ?? 'null')) } catch {} }, [])
  if (!order) return <section className="section"><h1>Order confirmation unavailable</h1><p>Please contact Hydro Blasters MNL if you need help with an order.</p></section>
  const confirmedOrder = order
  const items = confirmedOrder.items ?? []; const sameDay = confirmedOrder.delivery_method === 'same_day_delivery'
  async function copyReference() { try { await navigator.clipboard.writeText(confirmedOrder.order_reference); setCopied(true) } catch { setCopied(false) } }
  return <section className="section order-confirmation">
    <header><p className="eyebrow">✅ Order Received</p><h1>Thank you!</h1><p>Thank you! Your order has been received successfully.</p></header>
    {sameDay && <aside className="same-day-track"><strong>Same-Day / On-Demand Delivery</strong><p><b>Pickup origin: Pasay City</b></p><p><b>PLEASE <em>DO NOT</em> BOOK A RIDER YET.</b></p><p>We&apos;ll let you know once your package is ready for pickup.</p></aside>}
    <section className="order-number-reminder" aria-label="Save this order number"><p>Save this order number</p><strong className="order-reference">{order.order_reference}</strong><span>You will need it to track your order later. Take a screenshot or download your e-receipt before leaving this page.</span><div className="receipt-actions"><button type="button" className="secondary-button" onClick={() => void copyReference()}>Copy Order Number</button><button type="button" className="secondary-button" onClick={() => { if (!downloadReceipt(order)) setDownloadError('Receipt download is unavailable on this device.') }}>Download E-Receipt</button><Link className="primary-button" href={`/track-order?order=${encodeURIComponent(order.order_reference.trim())}`}>Track This Order</Link></div>{copied && <p className="receipt-feedback" role="status">Copied!</p>}{downloadError && <p className="receipt-feedback" role="alert">{downloadError}</p>}</section>
    <article className="receipt-card" id="order-receipt"><div className="receipt-brand">Hydro Blasters MNL<span>Order Receipt</span></div><dl className="receipt-details"><div><dt>Order Number</dt><dd>{order.order_reference}</dd></div><div><dt>Order Date</dt><dd>{new Date(order.order_date || Date.now()).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</dd></div><div><dt>Customer Name</dt><dd>{order.customer_name}</dd></div><div><dt>Mobile Number</dt><dd>{maskMobile(order.mobile_number)}</dd></div><div><dt>City / Municipality</dt><dd>{order.city_municipality || 'Not provided'}</dd></div><div><dt>Delivery Method</dt><dd>{deliveryLabel(order)}</dd></div></dl><h2>Purchased Items</h2><div className="receipt-items">{items.map((item, index) => <div key={`${item.name}-${index}`}><span>{item.name}{item.variant_name && <small>{item.variant_group_name || 'Option'}: {item.variant_name}</small>}<small>Qty: {item.quantity}</small></span><strong>{peso(item.line_total)}</strong></div>)}{items.length === 0 && <p>Item details are unavailable for this older order receipt.</p>}</div><dl className="receipt-totals"><div><dt>Merchandise</dt><dd>{peso(order.merchandise_subtotal)}</dd></div>{Number(order.promo_discount) > 0 && <div><dt>{order.promo_name || 'Launch Promo'} (10% Off)</dt><dd>−{peso(order.promo_discount!)}</dd></div>}<div><dt>{sameDay ? 'Website Delivery Fee' : 'Shipping'}</dt><dd>{peso(order.shipping_fee)}</dd></div>{sameDay && <div><dt>Courier Fee</dt><dd>Paid directly to rider</dd></div>}{Number(order.cod_service_fee) > 0 && <div><dt>COD Fee</dt><dd>{peso(order.cod_service_fee)}</dd></div>}<div><dt>Amount Due Now</dt><dd>{peso(order.upfront_amount)}</dd></div>{Number(order.rider_collectible_amount) > 0 && <div><dt>Amount Due to Rider</dt><dd>{peso(order.rider_collectible_amount)}</dd></div>}<div className="receipt-total"><dt>Overall Order Value</dt><dd>{peso(order.overall_total)}</dd></div></dl><div className="receipt-status"><span>Current Order Status</span><strong>{titleCase(order.order_status || order.payment_status)}</strong></div><p className="receipt-track">Track your order using the order number above.</p></article>
  </section>
}
