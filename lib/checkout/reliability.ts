import { supabase, supabasePublishableKey, supabaseUrl } from '../supabase/client'

export const promoReservationTimeoutMs = 8_000
export const proofReadTimeoutMs = 15_000
export const orderSubmissionTimeoutMs = 45_000

export type SupportedProofType = 'image/jpeg' | 'image/png' | 'image/webp'

const proofSignatures: { contentType: SupportedProofType; matches: (bytes: Uint8Array) => boolean }[] = [
  { contentType: 'image/jpeg', matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { contentType: 'image/png', matches: (bytes) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value) },
  { contentType: 'image/webp', matches: (bytes) => String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' },
]

export class CheckoutTimeoutError extends Error {
  constructor(public readonly code: 'promo_timeout' | 'proof_read_timeout' | 'order_timeout', message: string) {
    super(message)
    this.name = 'CheckoutTimeoutError'
  }
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, error: CheckoutTimeoutError) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(error), timeoutMs) }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export async function detectSupportedProofType(file: File): Promise<SupportedProofType | null> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  return proofSignatures.find((signature) => signature.matches(bytes))?.contentType ?? null
}

export async function fileToBase64(file: File, timeoutMs = proofReadTimeoutMs) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    const timeout = window.setTimeout(() => {
      reader.abort()
      reject(new CheckoutTimeoutError('proof_read_timeout', 'The payment screenshot took too long to process. Please choose it again.'))
    }, timeoutMs)
    const finish = (callback: () => void) => { window.clearTimeout(timeout); callback() }
    reader.onload = () => finish(() => {
      const result = typeof reader.result === 'string' ? reader.result.split(',')[1] : ''
      if (!result) reject(new Error('The payment screenshot could not be read. Please choose it again.'))
      else resolve(result)
    })
    reader.onerror = () => finish(() => reject(new Error('The payment screenshot could not be read. Please choose it again.')))
    reader.onabort = () => finish(() => reject(new CheckoutTimeoutError('proof_read_timeout', 'The payment screenshot processing was interrupted. Please choose it again.')))
    reader.readAsDataURL(file)
  })
}

export async function invokeGuestOrder(body: Record<string, unknown>, signal: AbortSignal) {
  const response = await fetch(`${supabaseUrl}/functions/v1/create-guest-order`, {
    method: 'POST',
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${supabasePublishableKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })
  const data = await response.json().catch(() => ({ error: 'Checkout service returned an unreadable response.' }))
  if (!response.ok || data?.error) {
    const error = new Error(typeof data?.error === 'string' ? data.error : 'Order could not be placed.') as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return data
}

type DiagnosticEvent = {
  attemptId: string
  eventCode: string
  phase: string
  disabledReasons?: string[]
  mimeCategory?: 'jpeg' | 'png' | 'webp' | 'other' | 'missing'
  sizeBucket?: 'empty' | 'under_1mb' | '1_to_5mb' | 'over_5mb'
  errorCode?: string
}

const browserFamily = () => {
  const agent = navigator.userAgent
  if (/Edg\//.test(agent)) return 'edge'
  if (/CriOS|Chrome\//.test(agent)) return 'chrome'
  if (/FxiOS|Firefox\//.test(agent)) return 'firefox'
  if (/Safari\//.test(agent)) return 'safari'
  return 'other'
}

export function proofSizeBucket(size: number): NonNullable<DiagnosticEvent['sizeBucket']> {
  if (size === 0) return 'empty'
  if (size < 1024 * 1024) return 'under_1mb'
  if (size <= 5 * 1024 * 1024) return '1_to_5mb'
  return 'over_5mb'
}

export function proofMimeCategory(type: string): NonNullable<DiagnosticEvent['mimeCategory']> {
  if (!type) return 'missing'
  if (type === 'image/jpeg') return 'jpeg'
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'other'
}

export function logCheckoutDiagnostic(event: DiagnosticEvent) {
  const row = {
    attempt_id: event.attemptId,
    event_code: event.eventCode.slice(0, 48),
    phase: event.phase.slice(0, 48),
    disabled_reasons: (event.disabledReasons ?? []).slice(0, 8).map((reason) => reason.slice(0, 48)),
    device_class: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
    browser_family: browserFamily(),
    mime_category: event.mimeCategory ?? null,
    size_bucket: event.sizeBucket ?? null,
    error_code: event.errorCode?.slice(0, 64) ?? null,
    online: navigator.onLine,
    app_version: process.env.NEXT_PUBLIC_APP_VERSION?.slice(0, 64) ?? null,
  }
  void (async () => {
    try { await supabase.from('checkout_diagnostics').insert(row) } catch { /* Diagnostics never block checkout. */ }
  })()
}

export function createAnonymousAttemptId() {
  try {
    const stored = sessionStorage.getItem('hydro-checkout-diagnostic-attempt')
    if (stored) return stored
    const created = crypto.randomUUID()
    sessionStorage.setItem('hydro-checkout-diagnostic-attempt', created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

export function supportCode(attemptId: string) {
  return attemptId.replaceAll('-', '').slice(0, 10).toUpperCase()
}
