import { supabase } from '../supabase/client'

export type LaunchPromoStatus = {
  active: boolean
  remainingSlots: number
  discountPercent: number
  maximumDiscount: number
}

type PromoPreviewLine = {
  id: string
  product_id?: string
  price: number | string
  quantity: number
  is_clearance?: boolean
}

export type LaunchPromoEligibility = {
  eligibleSubtotal: number
  discount: number
}

export function getCartProductId(line: Pick<PromoPreviewLine, 'id' | 'product_id'>) {
  return line.product_id ?? line.id.split(':')[0]
}

export function calculateLaunchPromoEligibility(
  lines: PromoPreviewLine[],
  promo: Pick<LaunchPromoStatus, 'active' | 'discountPercent' | 'maximumDiscount'> | null,
  clearanceByProductId?: Record<string, boolean>,
): LaunchPromoEligibility {
  const eligibleSubtotal = lines.reduce((total, line) => {
    const productId = getCartProductId(line)
    const isClearance = clearanceByProductId?.[productId] ?? line.is_clearance === true
    return isClearance ? total : total + Number(line.price) * line.quantity
  }, 0)

  const discount = promo?.active && eligibleSubtotal > 0
    ? Math.min(Math.round(eligibleSubtotal * promo.discountPercent * 100) / 100, promo.maximumDiscount)
    : 0

  return { eligibleSubtotal, discount }
}

export async function fetchClearanceByProductId(productIds: string[]): Promise<Record<string, boolean> | null> {
  const uniqueProductIds = [...new Set(productIds.filter(Boolean))]
  if (!uniqueProductIds.length) return {}

  const { data, error } = await supabase
    .from('products')
    .select('id,is_clearance')
    .in('id', uniqueProductIds)

  if (error || !data || data.length !== uniqueProductIds.length) return null

  return Object.fromEntries(data.map((product) => [product.id, product.is_clearance === true]))
}

export async function fetchLaunchPromoStatus(): Promise<LaunchPromoStatus | null> {
  const { data, error } = await supabase.rpc('get_launch_promo_status')
  if (error || !data?.[0]) return null
  const status = data[0] as { active: boolean; remaining_slots: number | string; discount_percent: number | string; maximum_discount: number | string }
  return {
    active: Boolean(status.active) && Number(status.remaining_slots) > 0,
    remainingSlots: Number(status.remaining_slots),
    discountPercent: Number(status.discount_percent),
    maximumDiscount: Number(status.maximum_discount),
  }
}
