import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers })
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const extension = (type: string) => type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return reply({ error: 'No valid administrator session was provided.' }, 401)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceRoleKey) return reply({ error: 'Secure QR upload is not configured.' }, 500)

  const accessToken = authorization.slice('Bearer '.length)
  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: userError } = await authClient.auth.getUser(accessToken)
  if (userError || !user) return reply({ error: 'Your administrator session is invalid or expired.' }, 401)
  if (user.app_metadata?.role !== 'admin') return reply({ error: 'You are not authorized to manage payment QR images.' }, 403)

  const admin = createClient(url, serviceRoleKey)
  try {
    const form = await request.formData()
    const action = String(form.get('action') ?? 'upload')
    const targetType = String(form.get('target_type') ?? '')
    const targetId = String(form.get('target_id') ?? '')
    if (!['payment_method', 'payment_method_option'].includes(targetType) || !targetId) return reply({ error: 'Payment QR upload target is invalid.' }, 400)

    const table = targetType === 'payment_method' ? 'payment_settings' : 'payment_method_options'
    const targetQuery = targetType === 'payment_method'
      ? admin.from('payment_settings').select('id, qr_path').eq('id', targetId).maybeSingle()
      : admin.from('payment_method_options').select('id, payment_method_id, qr_path').eq('id', targetId).maybeSingle()
    const { data: target, error: targetError } = await targetQuery
    if (targetError || !target) return reply({ error: 'The selected payment setting no longer exists.' }, 404)

    if (action === 'preview') {
      const path = target.qr_path as string | null
      if (!path) return reply({ error: 'No QR image has been saved for this setting.' }, 404)
      const { data: signed, error: signedError } = await admin.storage.from('payment-qrs').createSignedUrl(path, 60)
      if (signedError || !signed?.signedUrl) return reply({ error: 'QR preview URL could not be generated.' }, 500)
      return reply({ signed_url: signed.signedUrl })
    }

    if (action === 'delete') {
      if (targetType !== 'payment_method_option') return reply({ error: 'This payment setting cannot be deleted here.' }, 400)
      const oldPath = target.qr_path as string | null
      const { error: deleteError } = await admin.from(table).delete().eq('id', targetId)
      if (deleteError) return reply({ error: 'The bank option could not be deleted.' }, 500)
      if (oldPath) {
        const { error: storageError } = await admin.storage.from('payment-qrs').remove([oldPath])
        if (storageError) return reply({ message: 'Bank option deleted, but its old QR image could not be removed.' }, 200)
      }
      return reply({ message: 'Bank option deleted.' })
    }

    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return reply({ error: 'Choose a non-empty QR image.' }, 400)
    if (!allowedTypes.has(file.type)) return reply({ error: 'QR image must be JPG, PNG, or WebP.' }, 400)
    if (file.size > 5 * 1024 * 1024) return reply({ error: 'QR image must be 5 MB or smaller.' }, 400)

    const newPath = `settings/${targetId}/${crypto.randomUUID()}.${extension(file.type)}`
    const { error: uploadError } = await admin.storage.from('payment-qrs').upload(newPath, file, { contentType: file.type, upsert: false })
    if (uploadError) {
      console.error('Payment QR Storage upload failed:', uploadError.message)
      return reply({ error: 'The QR image could not be stored. Please try again.' }, 502)
    }

    const { error: updateError } = await admin.from(table).update({ qr_path: newPath, updated_at: new Date().toISOString() }).eq('id', targetId)
    if (updateError) {
      await admin.storage.from('payment-qrs').remove([newPath])
      console.error('Payment QR database update failed:', updateError.message)
      return reply({ error: 'The QR image uploaded, but the payment setting could not be updated.' }, 500)
    }

    const oldPath = target.qr_path as string | null
    let warning: string | undefined
    if (oldPath && oldPath !== newPath) {
      const { error: cleanupError } = await admin.storage.from('payment-qrs').remove([oldPath])
      if (cleanupError) warning = 'The new QR is active, but the previous QR image could not be removed.'
    }
    return reply({
      message: 'Payment QR image saved.',
      qr_image_path: newPath,
      payment_method_id: targetType === 'payment_method' ? targetId : target.payment_method_id,
      payment_option_id: targetType === 'payment_method_option' ? targetId : null,
      warning,
    })
  } catch (error) {
    console.error('Payment QR upload function failed:', error)
    return reply({ error: 'Payment QR upload could not be completed.' }, 500)
  }
})
