import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Appointment = {
  id: string
  customer_name: string
  mobile_number: string
  preferred_date: string
  preferred_time: string
  products_of_interest: string
  additional_notes: string | null
  status: string
  created_at: string
  admin_notification_sent_at: string | null
  admin_notification_attempted_at: string | null
}

const json = (body: Record<string, string>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const { appointmentId } = await request.json()
    if (!String(appointmentId ?? '').trim()) return json({ error: 'Appointment ID is required.' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: appointment, error } = await admin.from('showroom_appointments').select('id,customer_name,mobile_number,preferred_date,preferred_time,products_of_interest,additional_notes,status,created_at,admin_notification_sent_at,admin_notification_attempted_at').eq('id', appointmentId).single<Appointment>()
    if (error || !appointment) return json({ error: 'Appointment not found.' }, 404)
    if (appointment.admin_notification_sent_at || appointment.admin_notification_attempted_at) return json({ message: 'Notification already handled.' })

    const attemptedAt = new Date().toISOString()
    const { data: claimed, error: attemptError } = await admin.from('showroom_appointments').update({ admin_notification_attempted_at: attemptedAt, admin_notification_error: null }).eq('id', appointment.id).is('admin_notification_attempted_at', null).select('id').maybeSingle()
    if (attemptError) throw attemptError
    if (!claimed) return json({ message: 'Notification already handled.' })

    const resendKey = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('APPOINTMENT_FROM_EMAIL')
    const recipient = Deno.env.get('ADMIN_NOTIFICATION_EMAIL')
    if (!resendKey || !from || !recipient) {
      await admin.from('showroom_appointments').update({ admin_notification_error: 'Email notification is not configured.' }).eq('id', appointment.id)
      return json({ error: 'Email notification is not configured.' }, 503)
    }

    const details = [
      ['Appointment ID', appointment.id],
      ['Customer', appointment.customer_name],
      ['Mobile', appointment.mobile_number],
      ['Requested schedule', `${appointment.preferred_date} at ${appointment.preferred_time}`],
      ['Products they plan to purchase', appointment.products_of_interest],
      ['Additional notes', appointment.additional_notes || 'None'],
      ['Status', 'Pending'],
      ['Submitted', appointment.created_at],
    ]
    const text = `New showroom appointment request\n\n${details.map(([label, value]) => `${label}:\n${value}`).join('\n\n')}\n\nPlease review product availability and confirm or decline the appointment through the Admin Appointments page.`
    const html = `<!doctype html><html><body style="margin:0;background:#050506;color:#f5f4f7;font-family:Arial,sans-serif"><main style="max-width:620px;margin:0 auto;padding:28px"><h1 style="margin:0 0 20px;font-size:24px">New showroom appointment request</h1><table style="width:100%;border-collapse:collapse">${details.map(([label, value]) => `<tr><td style="width:38%;padding:12px;border:1px solid #2b2b36;color:#72eaff;font-weight:bold;vertical-align:top">${escapeHtml(label)}</td><td style="padding:12px;border:1px solid #2b2b36;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`).join('')}</table><p style="margin:24px 0 0;color:#a09fac;line-height:1.5">Please review product availability and confirm or decline the appointment through the Admin Appointments page.</p></main></body></html>`
    let response: Response
    try {
      response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [recipient], subject: `New Showroom Appointment Request — ${appointment.preferred_date} at ${appointment.preferred_time}`, html, text }) })
    } catch (error) {
      console.error('Resend could not be reached.', error)
      await admin.from('showroom_appointments').update({ admin_notification_error: 'Email provider could not be reached.' }).eq('id', appointment.id)
      return json({ error: 'Email notification was not sent.' }, 502)
    }
    if (!response.ok) {
      await admin.from('showroom_appointments').update({ admin_notification_error: 'Email provider rejected the notification.' }).eq('id', appointment.id)
      return json({ error: 'Email notification was not sent.' }, 502)
    }

    const { error: sentError } = await admin.from('showroom_appointments').update({ admin_notification_sent_at: new Date().toISOString(), admin_notification_error: null }).eq('id', appointment.id)
    if (sentError) throw sentError
    return json({ message: 'Notification sent.' }, 201)
  } catch (error) {
    console.error('Appointment notification failed.', error)
    return json({ error: 'Email notification was not sent.' }, 500)
  }
})
