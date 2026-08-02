import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { escapeTelegramHtml, sendTelegramMessage } from '../_shared/telegram.ts'

type Order = {
  id: string
  order_reference: string
  customer_name: string
  mobile_number: string
  city_municipality: string | null
  region: string | null
  order_notes: string | null
  delivery_method: string
  payment_method: string
  selected_payment_option_name: string | null
  merchandise_subtotal: number | string
  shipping_fee: number | string
  cod_service_fee: number | string
  upfront_amount: number | string
  rider_collectible_amount: number | string
  showroom_payable_amount: number | string
  overall_total: number | string
  payment_proof_path: string | null
  payment_status: string
  order_status: string
  telegram_notification_status: 'pending' | 'sent' | 'failed'
  telegram_notification_sent_at: string | null
  telegram_notification_attempted_at: string | null
}

type OrderItem = { product_name: string; quantity: number; line_total: number | string }

const json = (body: Record<string, string>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const peso = (value: number | string) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const readable = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!serviceRoleKey || !supabaseUrl) return json({ error: 'Order notification is not configured.' }, 503)
  if (request.headers.get('Authorization') !== `Bearer ${serviceRoleKey}`) return json({ error: 'Not authorized.' }, 401)

  try {
    const { orderId } = await request.json()
    if (!String(orderId ?? '').trim()) return json({ error: 'Order ID is required.' }, 400)

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id,order_reference,customer_name,mobile_number,city_municipality,region,order_notes,delivery_method,payment_method,selected_payment_option_name,merchandise_subtotal,shipping_fee,cod_service_fee,upfront_amount,rider_collectible_amount,showroom_payable_amount,overall_total,payment_proof_path,payment_status,order_status,telegram_notification_status,telegram_notification_sent_at,telegram_notification_attempted_at')
      .eq('id', orderId)
      .single<Order>()
    if (orderError || !order) return json({ error: 'Order not found.' }, 404)

    const proofRequired = !(order.delivery_method === 'showroom_pickup' && order.payment_method === 'pay_upon_pickup')
    if (proofRequired && !order.payment_proof_path) return json({ error: 'Order payment proof is not attached.' }, 409)
    if (order.telegram_notification_sent_at || order.telegram_notification_attempted_at || order.telegram_notification_status !== 'pending') return json({ message: 'Notification already handled.' })

    const { data: claimed, error: claimError } = await admin
      .from('orders')
      .update({ telegram_notification_attempted_at: new Date().toISOString(), telegram_notification_error: null })
      .eq('id', order.id)
      .eq('telegram_notification_status', 'pending')
      .is('telegram_notification_attempted_at', null)
      .select('id')
      .maybeSingle()
    if (claimError) throw claimError
    if (!claimed) return json({ message: 'Notification already handled.' })

    const { data: items, error: itemsError } = await admin
      .from('order_items')
      .select('product_name,quantity,line_total')
      .eq('order_id', order.id)
    if (itemsError || !items?.length) throw itemsError ?? new Error('Order items are missing.')

    const itemLines = (items as OrderItem[]).map((item) => `• ${escapeTelegramHtml(item.product_name)} × ${item.quantity} — ${peso(item.line_total)}`).join('\n')
    const address = [order.city_municipality, order.region].filter(Boolean).join(', ') || 'Not provided'
    const amountLines = [
      `<b>Merchandise</b>: ${peso(order.merchandise_subtotal)}`,
      Number(order.shipping_fee) > 0 ? `<b>Shipping</b>: ${peso(order.shipping_fee)}` : null,
      Number(order.cod_service_fee) > 0 ? `<b>COD fee</b>: ${peso(order.cod_service_fee)}` : null,
      `<b>Overall total</b>: ${peso(order.overall_total)}`,
      order.payment_method === 'pay_upon_pickup'
        ? `<b>Amount Due at Showroom</b>: ${peso(order.showroom_payable_amount)}`
        : `<b>Amount Due Now</b>: ${peso(order.upfront_amount)}`,
      order.payment_method === 'cash_on_delivery' ? `<b>Amount Due to Rider</b>: ${peso(order.rider_collectible_amount)}` : null,
    ].filter(Boolean).join('\n')
    const paymentLine = order.payment_method === 'bank_transfer' && order.selected_payment_option_name
      ? `${readable(order.payment_method)} (${escapeTelegramHtml(order.selected_payment_option_name)})`
      : readable(order.payment_method)
    const message = `<b>🛒 NEW WEBSITE ORDER</b>\n\n<b>Order</b>: #${escapeTelegramHtml(order.order_reference)}\n<b>Customer</b>: ${escapeTelegramHtml(order.customer_name)}\n<b>Mobile</b>: ${escapeTelegramHtml(order.mobile_number)}\n<b>Address</b>: ${escapeTelegramHtml(address)}\n\n<b>Items</b>\n${itemLines}\n\n${amountLines}\n\n<b>Delivery</b>: ${readable(order.delivery_method)}\n<b>Payment</b>: ${paymentLine}\n<b>Payment proof</b>: ${order.payment_proof_path ? 'Uploaded' : 'Not required'}\n<b>Payment status</b>: ${readable(order.payment_status)}\n<b>Order status</b>: ${readable(order.order_status)}\n\n<b>Notes</b>\n${escapeTelegramHtml(order.order_notes || 'None')}\n\nReview this order in Admin Orders.`

    const telegram = await sendTelegramMessage(message)
    if (!telegram.ok) {
      const safeError = telegram.code === 'not_configured' ? 'Telegram notification is not configured.' : telegram.code === 'unreachable' ? 'Telegram could not be reached.' : 'Telegram rejected the notification.'
      await admin.from('orders').update({ telegram_notification_status: 'failed', telegram_notification_error: safeError }).eq('id', order.id)
      console.error('Order Telegram notification failed.', { orderId: order.id, orderReference: order.order_reference, stage: 'send', telegramStatus: telegram.status, code: telegram.code })
      return json({ error: 'Telegram notification was not sent.' }, 502)
    }

    const { error: sentError } = await admin.from('orders').update({ telegram_notification_status: 'sent', telegram_notification_sent_at: new Date().toISOString(), telegram_notification_error: null }).eq('id', order.id)
    if (sentError) throw sentError
    return json({ message: 'Telegram notification sent.' }, 201)
  } catch (error) {
    console.error('Order notification failed.', error)
    return json({ error: 'Telegram notification was not sent.' }, 500)
  }
})
