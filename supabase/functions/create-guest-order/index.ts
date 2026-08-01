import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)
  try {
    const body = await request.json()
    const url = Deno.env.get('SUPABASE_URL')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey)
    const proofRequired = !((body.delivery_method === 'showroom_pickup') && body.payment_method === 'pay_upon_pickup')
    if (proofRequired && (!body.payment_proof?.base64 || !body.payment_proof?.contentType)) return reply({ error: 'A payment screenshot is required for this payment method.' }, 400)
    const allowed = ['image/jpeg','image/png','image/webp']
    if (proofRequired && !allowed.includes(body.payment_proof.contentType)) return reply({ error: 'Payment proof must be JPG, PNG, or WebP.' }, 400)
    const proofBytes = proofRequired ? Uint8Array.from(atob(body.payment_proof.base64), c => c.charCodeAt(0)) : null
    if (proofBytes && proofBytes.byteLength > 5 * 1024 * 1024) return reply({ error: 'Payment proof must be 5 MB or smaller.' }, 400)
    if (proofRequired) {
      const { data: paymentSetting, error: paymentSettingError } = await admin
        .from('payment_settings')
        .select('id')
        .eq('method', body.payment_method)
        .eq('enabled', true)
        .maybeSingle()
      if (paymentSettingError || !paymentSetting) return reply({ error: 'Payment details are temporarily unavailable. Please contact Hydro Blasters MNL before sending payment.' }, 400)
    }
    const { data, error } = await admin.rpc('create_guest_order', { payload: body })
    if (error || !data?.[0]) return reply({ error: error?.message ?? 'Order could not be created.' }, 400)
    const order = data[0]
    if (proofRequired) {
      const extension = body.payment_proof.contentType === 'image/png' ? 'png' : body.payment_proof.contentType === 'image/webp' ? 'webp' : 'jpg'
      const path = `payment-proofs/${order.order_reference}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await admin.storage.from('payment-proofs').upload(path, proofBytes!, { contentType: body.payment_proof.contentType, upsert: false })
      if (uploadError) { await admin.from('orders').delete().eq('id', order.order_id); return reply({ error: 'Payment proof upload failed. Your order was not created.' }, 500) }
      const { error: proofError } = await admin.from('orders').update({ payment_proof_path: path }).eq('id', order.order_id)
      if (proofError) { await admin.storage.from('payment-proofs').remove([path]); await admin.from('orders').delete().eq('id', order.order_id); return reply({ error: 'Order could not be finalized. Please try again.' }, 500) }
    }
    return reply({ order: { ...order, payment_status: 'pending_verification' } }, 201)
  } catch { return reply({ error: 'Checkout could not be completed. Please try again.' }, 500) }
})
