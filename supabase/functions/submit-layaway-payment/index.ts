import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers })
const allowedProofTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const orderReference = (value: unknown) => text(value).replace(/^#\s*/, '').toUpperCase()
const validAccessCode = (value: string) => /^LYW-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(value)

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function equalHash(first: string, second: string) {
  if (first.length !== second.length) return false
  let difference = 0
  for (let index = 0; index < first.length; index += 1) difference |= first.charCodeAt(index) ^ second.charCodeAt(index)
  return difference === 0
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)
  let attemptId: string | null = null
  let orderId: string | null = null
  let temporaryPath: string | null = null
  let finalPath: string | null = null
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const body = await request.json()
    const reference = orderReference(body.order_reference)
    const accessCode = text(body.access_code)
    attemptId = text(body.payment_attempt_key)
    const contentType = text(body.payment_proof?.contentType)
    if (!/^HBMNL-[A-Z0-9-]{6,}$/.test(reference) || !validAccessCode(accessCode) || !/^[0-9a-f-]{36}$/i.test(attemptId)) return reply({ error: 'Layaway payment request is invalid.' }, 400)
    if (!allowedProofTypes.has(contentType) || !text(body.payment_proof?.base64)) return reply({ error: 'A JPG, PNG, or WebP payment screenshot is required.' }, 400)
    const proofBytes = Uint8Array.from(atob(body.payment_proof.base64), (char) => char.charCodeAt(0))
    if (!proofBytes.byteLength || proofBytes.byteLength > 5 * 1024 * 1024) return reply({ error: 'Payment proof must be between 1 byte and 5 MB.' }, 400)

    const { data: order, error: orderError } = await admin.from('orders').select('id,order_reference,layaway_status,layaway_access_token_hash').eq('order_reference', reference).eq('payment_method', 'layaway').maybeSingle()
    if (orderError || !order || !order.layaway_access_token_hash || !equalHash(await sha256(accessCode), order.layaway_access_token_hash)) return reply({ error: 'Layaway order access could not be verified.' }, 403)
    orderId = order.id
    const { data: prepared, error: prepareError } = await admin.rpc('prepare_layaway_payment', { p_order_id: order.id, p_attempt: attemptId, p_pay_all: body.pay_all === true })
    if (prepareError || !prepared?.[0]) return reply({ error: prepareError?.message ?? 'Layaway payment is not available.' }, 409)
    if (prepared[0].payment_batch_id !== attemptId || !Array.isArray(prepared[0].payment_ids) || prepared[0].payment_ids.length === 0) {
      return reply({ error: 'This layaway was cancelled after two consecutive missed payments. Payments are forfeited and no refund is issued.' }, 409)
    }

    const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
    temporaryPath = `pending/layaway/${attemptId}.${extension}`
    finalPath = `orders/${order.order_reference}/layaway/${attemptId}.${extension}`
    const { error: uploadError } = await admin.storage.from('payment-proofs').upload(temporaryPath, proofBytes, { contentType, upsert: false })
    if (uploadError) throw new Error('Payment proof upload failed.')
    const { error: moveError } = await admin.storage.from('payment-proofs').move(temporaryPath, finalPath)
    temporaryPath = null
    if (moveError) throw new Error('Payment proof upload failed.')
    const { data: amount, error: attachError } = await admin.rpc('attach_layaway_payment_proof', { p_order_id: order.id, p_attempt: attemptId, p_proof_path: finalPath })
    if (attachError) throw new Error(attachError.message)
    return reply({ order_reference: order.order_reference, payment_attempt_key: attemptId, amount_due: amount, payment_status: 'pending_verification' }, 201)
  } catch (error) {
    if (temporaryPath) await admin.storage.from('payment-proofs').remove([temporaryPath])
    if (finalPath) await admin.storage.from('payment-proofs').remove([finalPath])
    if (orderId && attemptId) await admin.rpc('reset_layaway_payment_attempt', { p_order_id: orderId, p_attempt: attemptId })
    console.error('Layaway payment submission failed.', { orderId, attemptId, error: error instanceof Error ? error.message : String(error) })
    return reply({ error: 'Layaway payment could not be submitted. Please try again.' }, 500)
  }
})
