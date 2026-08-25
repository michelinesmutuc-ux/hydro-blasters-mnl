import { supabase } from '../supabase/client'
import { CheckoutTimeoutError, promoReservationTimeoutMs, withTimeout } from '../checkout/reliability'

export const checkoutSessionStorageKey = 'hydro-launch-promo-checkout-session'
let memoryCheckoutSessionId: string | null = null

export type ReservationStatus = 'reserved' | 'unavailable' | 'expired' | 'error'
export type CheckoutReservation = {
  status: ReservationStatus
  failureReason?: 'timeout' | 'request_error' | 'client_error'
  expiresAt?: string
  serverNow?: string
  eligibleSubtotal: number
  discount: number
}

type CartLine = { id: string; product_id?: string; variant_id?: string | null; quantity: number }

export function getOrCreateCheckoutSessionId() {
  if (memoryCheckoutSessionId) return memoryCheckoutSessionId
  try {
    const existing = localStorage.getItem(checkoutSessionStorageKey)
    if (existing) { memoryCheckoutSessionId = existing; return existing }
  } catch { /* Continue with an in-memory checkout session. */ }
  memoryCheckoutSessionId = crypto.randomUUID()
  try { localStorage.setItem(checkoutSessionStorageKey, memoryCheckoutSessionId) } catch { /* In-memory ID remains valid for this page. */ }
  return memoryCheckoutSessionId
}

export function getExistingCheckoutSessionId() {
  if (memoryCheckoutSessionId) return memoryCheckoutSessionId
  try { return localStorage.getItem(checkoutSessionStorageKey) } catch { return null }
}

const toItems = (lines: CartLine[]) => lines.map((line) => ({
  product_id: line.product_id ?? line.id,
  variant_id: line.variant_id ?? null,
  quantity: line.quantity,
}))

export async function getOrCreateLaunchPromoReservation(lines: CartLine[], allowRecheck = false): Promise<CheckoutReservation> {
  try {
    const request = Promise.resolve(supabase.rpc('reserve_launch_promo', {
      checkout_session: getOrCreateCheckoutSessionId(),
      items: toItems(lines),
      allow_recheck: allowRecheck,
    }))
    const { data, error } = await withTimeout(request, promoReservationTimeoutMs, new CheckoutTimeoutError('promo_timeout', 'Promo availability timed out.'))
    const result = data?.[0]
    if (error || !result) return { status: 'error', failureReason: 'request_error', eligibleSubtotal: 0, discount: 0 }
    const status = result.status as ReservationStatus
    return {
      status,
      expiresAt: result.expires_at ?? undefined,
      serverNow: result.server_now ?? undefined,
      eligibleSubtotal: Number(result.eligible_subtotal ?? 0),
      discount: status === 'reserved' ? Number(result.discount_amount) : 0,
    }
  } catch (error) {
    return { status: 'error', failureReason: error instanceof CheckoutTimeoutError ? 'timeout' : 'client_error', eligibleSubtotal: 0, discount: 0 }
  }
}

export async function getExistingLaunchPromoReservation(): Promise<CheckoutReservation | null> {
  const checkoutSession = getExistingCheckoutSessionId()
  if (!checkoutSession) return null
  const { data, error } = await supabase.rpc('get_launch_promo_reservation', { checkout_session: checkoutSession })
  const result = data?.[0]
  if (error || !result) return null
  return {
    status: result.status as ReservationStatus,
    expiresAt: result.expires_at ?? undefined,
    serverNow: result.server_now ?? undefined,
    eligibleSubtotal: Number(result.eligible_subtotal ?? 0),
    discount: result.status === 'reserved' ? Number(result.discount_amount) : 0,
  }
}
