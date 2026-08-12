import { supabase } from '../supabase/client'

export type LaunchPromoStatus = {
  active: boolean
  remainingSlots: number
  discountPercent: number
  maximumDiscount: number
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
