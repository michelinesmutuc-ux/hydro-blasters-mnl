import { supabase } from '../supabase/client'

export const checkoutSessionStorageKey = 'hydro-launch-promo-checkout-session'

export type ReservationStatus = 'reserved' | 'unavailable' | 'expired' | 'error'
export type CheckoutReservation = {
  status: ReservationStatus
  expiresAt?: string
  serverNow?: string
  eligibleSubtotal: number
  discount: number
}

type CartLine = { id: string; product_id?: string; variant_id?: string | null; quantity: number }

export function getOrCreateCheckoutSessionId() {
  const existing = localStorage.getItem(checkoutSessionStorageKey)
  if (existing) return existing
  const created = crypto.randomUUID()
  localStorage.setItem(checkoutSessionStorageKey, created)
  return created
}

export function getExistingCheckoutSessionId() {
  return localStorage.getItem(checkoutSessionStorageKey)
}

const toItems = (lines: CartLine[]) => lines.map((line) => ({
  product_id: line.product_id ?? line.id,
  variant_id: line.variant_id ?? null,
  quantity: line.quantity,
}))

export async function getOrCreateLaunchPromoReservation(lines: CartLine[], allowRecheck = false): Promise<CheckoutReservation> {
  const { data, error } = await supabase.rpc('reserve_launch_promo', {
    checkout_session: getOrCreateCheckoutSessionId(),
    items: toItems(lines),
    allow_recheck: allowRecheck,
  })
  const result = data?.[0]
  if (error || !result) return { status: 'error', eligibleSubtotal: 0, discount: 0 }
  const status = result.status as ReservationStatus
  return {
    status,
    expiresAt: result.expires_at ?? undefined,
    serverNow: result.server_now ?? undefined,
    eligibleSubtotal: Number(result.eligible_subtotal ?? 0),
    discount: status === 'reserved' ? Number(result.discount_amount) : 0,
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
