export const escapeTelegramHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

export async function sendTelegramMessage(message: string) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID')

  if (!botToken || !chatId) return { ok: false, status: 503, code: 'not_configured' as const }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML', disable_web_page_preview: true }),
    })

    return response.ok
      ? { ok: true, status: response.status, code: 'sent' as const }
      : { ok: false, status: response.status, code: 'rejected' as const }
  } catch (error) {
    console.error('Telegram could not be reached.', error)
    return { ok: false, status: 502, code: 'unreachable' as const }
  }
}
