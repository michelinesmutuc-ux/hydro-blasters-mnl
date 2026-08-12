import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers })

async function triggerOrderNotification(admin: ReturnType<typeof createClient>, url: string, serviceKey: string, order: { order_id: string; order_reference: string }) {
  try {
    const notificationResponse = await fetch(`${url}/functions/v1/notify-new-order`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.order_id }),
      signal: AbortSignal.timeout(12_000),
    })
    if (notificationResponse.ok) return

    console.error('Order notification was not sent.', { orderId: order.order_id, orderReference: order.order_reference, status: notificationResponse.status })
    await admin.from('orders').update({ telegram_notification_status: 'failed', telegram_notification_error: 'Order notification could not be completed.' }).eq('id', order.order_id).eq('telegram_notification_status', 'pending')
  } catch (notificationError) {
    console.error('Order notification could not be invoked.', { orderId: order.order_id, orderReference: order.order_reference, notificationError })
    await admin.from('orders').update({ telegram_notification_status: 'failed', telegram_notification_error: 'Order notification timed out or could not be reached.' }).eq('id', order.order_id).eq('telegram_notification_status', 'pending')
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)
  try {
    const body = await request.json()
    const url = Deno.env.get('SUPABASE_URL')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey)
    const proofRequired = !((body.delivery_method === 'showroom_pickup') && body.payment_method === 'pay_upon_pickup')
    if (body.delivery_method === 'same_day_delivery' && body.payment_method === 'cash_on_delivery') return reply({ error: 'Cash on Delivery is not available for Same-Day / On-Demand Delivery.' }, 400)
    if (body.delivery_method === 'same_day_delivery' && !body.same_day_acknowledged) return reply({ error: 'Confirm that you will wait for the Ready for Rider confirmation.' }, 400)
    if (proofRequired && (!body.payment_proof?.base64 || !body.payment_proof?.contentType)) return reply({ error: 'A payment screenshot is required for this payment method.' }, 400)
    const allowed = ['image/jpeg','image/png','image/webp']
    if (proofRequired && !allowed.includes(body.payment_proof.contentType)) return reply({ error: 'Payment proof must be JPG, PNG, or WebP.' }, 400)
    const proofBytes = proofRequired ? Uint8Array.from(atob(body.payment_proof.base64), c => c.charCodeAt(0)) : null
    if (proofBytes && proofBytes.byteLength > 5 * 1024 * 1024) return reply({ error: 'Payment proof must be 5 MB or smaller.' }, 400)
    if (body.payment_method === 'bank_transfer' && !String(body.payment_option_name ?? '').trim()) return reply({ error: 'Choose your bank before placing your order.' }, 400)
    const extension = body.payment_proof?.contentType === 'image/png' ? 'png' : body.payment_proof?.contentType === 'image/webp' ? 'webp' : 'jpg'
    const proofFileId = crypto.randomUUID()
    const temporaryProofPath = proofRequired ? `pending/${body.idempotency_key}/${proofFileId}.${extension}` : null

    if (proofRequired) {
      const { data: uploadedProof, error: uploadError } = await admin.storage
        .from('payment-proofs')
        .upload(temporaryProofPath!, proofBytes!, { contentType: body.payment_proof.contentType, upsert: false })
      if (uploadError || uploadedProof?.path !== temporaryProofPath) {
        return reply({ error: 'Payment proof upload failed. Your order was not created.' }, 500)
      }
    }

    const { data, error } = await admin.rpc('create_guest_order', { payload: body })
    if (error || !data?.[0]) {
      if (temporaryProofPath) await admin.storage.from('payment-proofs').remove([temporaryProofPath])
      return reply({ error: error?.message ?? 'Order could not be created.' }, 400)
    }

    const order = data[0]
    const { data: savedOrder, error: savedOrderError } = await admin.from('orders').select('payment_proof_path').eq('id', order.order_id).single()
    if (savedOrderError || !savedOrder) {
      if (temporaryProofPath) await admin.storage.from('payment-proofs').remove([temporaryProofPath])
      return reply({ error: 'Order could not be finalized. Please try again.' }, 500)
    }

    if (proofRequired && !savedOrder.payment_proof_path) {
      const finalProofPath = `orders/${order.order_reference}/${proofFileId}.${extension}`
      const { error: moveError } = await admin.storage.from('payment-proofs').move(temporaryProofPath!, finalProofPath)
      if (moveError) {
        await admin.storage.from('payment-proofs').remove([temporaryProofPath!])
        await admin.from('orders').delete().eq('id', order.order_id)
        return reply({ error: 'Payment proof upload failed. Your order was not created.' }, 500)
      }

      const { data: finalizedOrder, error: proofError } = await admin
        .from('orders')
        .update({ payment_proof_path: finalProofPath })
        .eq('id', order.order_id)
        .select('payment_proof_path')
        .single()
      if (proofError || finalizedOrder?.payment_proof_path !== finalProofPath) {
        await admin.storage.from('payment-proofs').remove([finalProofPath])
        await admin.from('orders').delete().eq('id', order.order_id)
        return reply({ error: 'Order could not be finalized. Please try again.' }, 500)
      }
    } else if (temporaryProofPath) {
      await admin.storage.from('payment-proofs').remove([temporaryProofPath])
    }

    EdgeRuntime.waitUntil(triggerOrderNotification(admin, url, serviceKey, order))

    return reply({ order: { ...order, payment_status: 'pending_verification' } }, 201)
  } catch { return reply({ error: 'Checkout could not be completed. Please try again.' }, 500) }
})
