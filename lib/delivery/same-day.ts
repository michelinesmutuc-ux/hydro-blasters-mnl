// This is intentionally empty: selected nearby cities are merchant-configured
// in Supabase, while Metro Manila is always available.
export const sameDayNearbyCities: string[] = []

const metroManilaCities = new Set([
  'caloocan', 'las pinas', 'las piñas', 'makati', 'malabon', 'mandaluyong',
  'manila', 'marikina', 'muntinlupa', 'muntinlupa city', 'navotas', 'paranaque',
  'parañaque', 'pasay', 'pasig', 'quezon city', 'san juan', 'taguig', 'valenzuela',
])

const normalise = (value: string) => value.trim().toLocaleLowerCase('en-PH').replace(/[.,]/g, '').replace(/\s+/g, ' ')

export function isSameDayEligibleCity(city: string, nearbyCities = sameDayNearbyCities) {
  const normalised = normalise(city)
  return metroManilaCities.has(normalised) || nearbyCities.map(normalise).includes(normalised)
}

export function sameDayProcessingLabel(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', hourCycle: 'h23' }).format(now))
  return hour < 15 ? 'same_day_processing' : 'next_day_processing'
}
