import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }
const reply = (body: Record<string, string>, status = 200) => new Response(JSON.stringify(body), { status, headers })

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)

  try {
    const body = await request.json()
    for (const key of ['customer_name', 'mobile_number', 'preferred_date', 'preferred_time', 'products_of_interest']) if (!String(body[key] ?? '').trim()) return reply({ error: 'Please complete all required appointment fields.' }, 400)
    if (body.agreement !== true) return reply({ error: 'Please confirm the appointment-only showroom agreement.' }, 400)

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data: appointment, error } = await admin.from('showroom_appointments').insert({ customer_name: body.customer_name.trim(), mobile_number: body.mobile_number.trim(), preferred_date: body.preferred_date, preferred_time: body.preferred_time, products_of_interest: body.products_of_interest.trim(), additional_notes: body.additional_notes?.trim() || null, status: 'pending' }).select('id').single()
    if (error) throw error

    let notificationFailure: string | null = null
    try {
      const notificationResponse = await fetch(`${supabaseUrl}/functions/v1/notify-new-appointment`, { method: 'POST', headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId: appointment.id }), signal: AbortSignal.timeout(12_000) })
      if (!notificationResponse.ok) {
        notificationFailure = `Appointment notification invocation failed (HTTP ${notificationResponse.status}).`
        console.error('Appointment notification was not sent.', { appointmentId: appointment.id, status: notificationResponse.status })
      }
    } catch {
      notificationFailure = 'Appointment notification timed out or could not be reached; delivery may be unknown.'
      console.error('Appointment notification could not be invoked.', { appointmentId: appointment.id })
    }

    if (notificationFailure) {
      try {
        const { error: statusError } = await admin.from('showroom_appointments').update({ admin_notification_error: notificationFailure }).eq('id', appointment.id).is('admin_notification_sent_at', null).is('admin_notification_error', null)
        if (statusError) console.error('Appointment notification failure status could not be saved.', { appointmentId: appointment.id })
      } catch { console.error('Appointment notification failure status could not be saved.', { appointmentId: appointment.id }) }
    }

    return reply({ message: 'Appointment request received.' }, 201)
  } catch {
    return reply({ error: 'Your appointment request could not be sent. Please try again.' }, 500)
  }
})
