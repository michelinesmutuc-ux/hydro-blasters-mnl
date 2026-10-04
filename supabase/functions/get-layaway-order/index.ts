import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers })
const reference = (value: unknown) => typeof value === 'string' ? value.trim().replace(/^#\s*/, '').toUpperCase() : ''
const code = (value: unknown) => typeof value === 'string' ? value.trim() : ''
async function sha256(value: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('') }
function equalHash(first: string, second: string) { if (first.length !== second.length) return false; let difference = 0; for (let index = 0; index < first.length; index += 1) difference |= first.charCodeAt(index) ^ second.charCodeAt(index); return difference === 0 }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)
  try {
    const body = await request.json()
    const orderReference = reference(body.order_reference), accessCode = code(body.access_code)
    if (!/^HBMNL-[A-Z0-9-]{6,}$/.test(orderReference) || accessCode.length < 32) return reply({ error: 'Layaway access could not be verified.' }, 403)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: order, error: orderError } = await admin.from('orders').select('id,order_reference,layaway_status,layaway_price,shipping_fee,layaway_access_token_hash').eq('order_reference', orderReference).eq('payment_method', 'layaway').maybeSingle()
    if (orderError || !order || !order.layaway_access_token_hash || !equalHash(await sha256(accessCode), order.layaway_access_token_hash)) return reply({ error: 'Layaway access could not be verified.' }, 403)
    await admin.rpc('refresh_layaway_status', { p_order_id: order.id })
    const { data: refreshed, error: refreshError } = await admin.from('orders').select('layaway_status,layaway_price,shipping_fee').eq('id', order.id).single()
    if (refreshError || !refreshed) throw refreshError ?? new Error('Layaway order was unavailable.')
    const { data: payments, error: paymentError } = await admin.from('order_payments').select('id,payment_kind,installment_number,merchandise_amount,shipping_amount,late_fee_amount,amount_due,amount_paid,due_date,payment_status,submitted_at,verified_at').eq('order_id', order.id).order('installment_number', { ascending: true, nullsFirst: true })
    if (paymentError) throw paymentError
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    const rows = (payments ?? []).map((payment) => {
      const daysLate = payment.payment_kind === 'installment' && payment.due_date && payment.due_date < today ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${payment.due_date}T00:00:00Z`)) / 86400000) : 0
      const lateFee = ['scheduled', 'due', 'rejected'].includes(payment.payment_status) && daysLate > 0 ? Math.round(Number(payment.merchandise_amount) * (daysLate <= 7 ? .05 : .10) * 100) / 100 : Number(payment.late_fee_amount)
      return { ...payment, late_fee_amount: lateFee, amount_due: Math.round((Number(payment.merchandise_amount) + Number(payment.shipping_amount) + lateFee) * 100) / 100 }
    })
    const unpaid = rows.filter((payment) => !['verified', 'cancelled'].includes(payment.payment_status))
    const currentlyDue = refreshed.layaway_status === 'awaiting_down_payment'
      ? unpaid.filter((payment) => payment.payment_kind === 'down_payment')
      : unpaid.filter((payment) => payment.payment_kind === 'installment' && payment.due_date && payment.due_date <= today)
    const amountPaid = rows.filter((payment) => payment.payment_status === 'verified').reduce((sum, payment) => sum + Number(payment.amount_paid), 0)
    const remainingBalance = unpaid.reduce((sum, payment) => sum + Number(payment.amount_due), 0)
    return reply({ order: { order_reference: order.order_reference, layaway_status: refreshed.layaway_status, layaway_price: refreshed.layaway_price, shipping_fee: refreshed.shipping_fee, amount_paid: amountPaid, remaining_balance: remainingBalance, amount_currently_due: currentlyDue.reduce((sum, payment) => sum + Number(payment.amount_due), 0), early_payoff_amount: unpaid.reduce((sum, payment) => sum + Number(payment.amount_due), 0), next_due_date: unpaid.find((payment) => payment.payment_kind === 'installment')?.due_date ?? null, payments: rows } })
  } catch (error) { console.error('Layaway order access failed.', error); return reply({ error: 'Layaway order is temporarily unavailable. Please try again shortly.' }, 503) }
})
