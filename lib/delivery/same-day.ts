export type SameDayNearbyArea = { city: string; province: string | null }

const metroManilaCities = new Set([
  'caloocan', 'las pinas', 'makati', 'malabon', 'mandaluyong', 'manila',
  'marikina', 'muntinlupa', 'navotas', 'paranaque', 'pasay', 'pasig',
  'pateros', 'quezon city', 'san juan', 'taguig', 'valenzuela',
])

function normaliseText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('en-PH')
    .replace(/ñ/g, 'n')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
}

export function normaliseSameDayCity(value: string) {
  return normaliseText(value)
    .replace(/^city of\s+/, '')
    .replace(/\s+city$/, '')
    .trim()
}

export function normaliseSameDayProvince(value: string) {
  return normaliseText(value)
    .replace(/^province of\s+/, '')
    .replace(/\s+province$/, '')
    .trim()
}

export function isSameDayEligibleLocation(city: string, provinceOrRegion: string, nearbyAreas: SameDayNearbyArea[]) {
  const normalisedCity = normaliseSameDayCity(city)
  if (metroManilaCities.has(normalisedCity)) return true

  const normalisedProvince = normaliseSameDayProvince(provinceOrRegion)
  return nearbyAreas.some((area) => (
    normaliseSameDayCity(area.city) === normalisedCity
    && normaliseSameDayProvince(area.province ?? '') === normalisedProvince
  ))
}

export function sameDayProcessingLabel(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', hourCycle: 'h23' }).format(now))
  return hour < 15 ? 'same_day_processing' : 'next_day_processing'
}
