import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Appointment = {
  id: string
  customer_name: string
  mobile_number: string
  preferred_date: string
  preferred_time: string
  products_of_interest: string
  additional_notes: string | null
  admin_notification_sent_at: string | null
  admin_notification_attempted_at: string | null
}

const json = (body: Record<string, string>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const escapeTelegramHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const { appointmentId } = await request.json()
    if (!String(appointmentId ?? '').trim()) return json({ error: 'Appointment ID is required.' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: appointment, error } = await admin.from('showroom_appointments').select('id,customer_name,mobile_number,preferred_date,preferred_time,products_of_interest,additional_notes,admin_notification_sent_at,admin_notification_attempted_at').eq('id', appointmentId).single<Appointment>()
    if (error || !appointment) return json({ error: 'Appointment not found.' }, 404)
    if (appointment.admin_notification_sent_at || appointment.admin_notification_attempted_at) return json({ message: 'Notification already handled.' })

    const { data: claimed, error: claimError } = await admin.from('showroom_appointments').update({ admin_notification_attempted_at: new Date().toISOString(), admin_notification_error: null }).eq('id', appointment.id).is('admin_notification_attempted_at', null).select('id').maybeSingle()
    if (claimError) throw claimError
    if (!claimed) return json({ message: 'Notification already handled.' })

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
    if (!botToken || !chatId) {
      await admin.from('showroom_appointments').update({ admin_notification_error: 'Telegram notification is not configured.' }).eq('id', appointment.id)
      return json({ error: 'Telegram notification is not configured.' }, 503)
    }

    const message = `<b>New showroom appointment request</b>\n\n<b>Customer</b>\n${escapeTelegramHtml(appointment.customer_name)}\n\n<b>Mobile</b>\n${escapeTelegramHtml(appointment.mobile_number)}\n\n<b>Requested schedule</b>\n${escapeTelegramHtml(`${appointment.preferred_date} at ${appointment.preferred_time}`)}\n\n<b>Products they plan to purchase</b>\n${escapeTelegramHtml(appointment.products_of_interest)}\n\n<b>Additional notes</b>\n${escapeTelegramHtml(appointment.additional_notes || 'None')}\n\n<b>Status</b>\nPending\n\n<b>Appointment ID</b>\n${escapeTelegramHtml(appointment.id)}\n\nReview product availability in the Admin Appointments page.`

    let response: Response
    try {
      response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML', disable_web_page_preview: true }) })
    } catch (telegramError) {
      console.error('Telegram could not be reached.', telegramError)
      await admin.from('showroom_appointments').update({ admin_notification_error: 'Telegram could not be reached.' }).eq('id', appointment.id)
      return json({ error: 'Telegram notification was not sent.' }, 502)
    }
    if (!response.ok) {
      await admin.from('showroom_appointments').update({ admin_notification_error: 'Telegram rejected the notification.' }).eq('id', appointment.id)
      return json({ error: 'Telegram notification was not sent.' }, 502)
    }

    const { error: sentError } = await admin.from('showroom_appointments').update({ admin_notification_sent_at: new Date().toISOString(), admin_notification_error: null }).eq('id', appointment.id)
    if (sentError) throw sentError
    return json({ message: 'Telegram notification sent.' }, 201)
  } catch (error) {
    console.error('Appointment notification failed.', error)
    return json({ error: 'Telegram notification was not sent.' }, 500)
  }
})
