import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers })
const normalizeMobile = (value: string) => value.replace(/\D/g, '').replace(/^\+?63/, '0')
const normalizeOrderReference = (value: string) => value.trim().replace(/^#\s*/, '').toUpperCase()
const lastName = (name: string) => {
  const words = name.trim().split(/\s+/)
  return words[words.length - 1]?.toLocaleLowerCase() ?? ''
}
const safeOrderFields = 'id,order_reference,customer_name,first_name,last_name,mobile_number,city_municipality,delivery_method,payment_method,merchandise_subtotal,shipping_fee,cod_service_fee,upfront_amount,rider_collectible_amount,overall_total,promo_name,promo_discount,payment_status,order_status,created_at'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return reply({ error: 'Order tracking is temporarily unavailable. Please try again shortly.' }, 405)
  try {
    const { mode, orderNumber, surname, mobileNumber } = await request.json()
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    let orders: Record<string, unknown>[] = []
    if (mode === 'reference') {
      const reference = normalizeOrderReference(String(orderNumber ?? ''))
      if (!/^HBMNL-[A-Z0-9-]{6,}$/.test(reference)) return reply({ error: 'No matching order found.' }, 404)
      const { data, error } = await admin.from('orders').select(safeOrderFields).eq('order_reference', reference).limit(1)
      if (error) throw error
      orders = data ?? []
    } else if (mode === 'customer') {
      const normalizedSurname = String(surname ?? '').trim().toLocaleLowerCase()
      const normalizedMobile = normalizeMobile(String(mobileNumber ?? ''))
      if (!normalizedSurname || !/^0\d{10}$/.test(normalizedMobile)) return reply({ error: 'No matching order found.' }, 404)
      const { data, error } = await admin.from('orders').select(safeOrderFields).order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      orders = (data ?? []).filter((order) => {
        const savedLastName = String(order.last_name ?? '').trim().toLocaleLowerCase()
        return (savedLastName || lastName(String(order.customer_name))) === normalizedSurname && normalizeMobile(String(order.mobile_number)) === normalizedMobile
      })
    } else return reply({ error: 'No matching order found.' }, 404)
    if (!orders.length) return reply({ error: 'No matching order found.' }, 404)
    if (mode === 'customer' && orders.length > 1) return reply({ orders: orders.map(({ id, order_reference, created_at, order_status, overall_total }) => ({ id, order_reference, created_at, order_status, overall_total })) })
    const order = orders[0]
    const { data: items, error: itemError } = await admin.from('order_items').select('product_name,variant_group_name,variant_name,quantity,line_total').eq('order_id', order.id)
    if (itemError) throw itemError
    return reply({ order: { ...order, items: items ?? [] } })
  } catch (error) {
    console.error('Public order tracking failed.', error)
    return reply({ error: 'Order tracking is temporarily unavailable. Please try again shortly.' }, 503)
  }
})
