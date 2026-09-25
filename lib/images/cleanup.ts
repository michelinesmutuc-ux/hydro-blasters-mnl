import { isVerifiedProductImageKey, PRODUCT_IMAGE_DELIVERY_ORIGIN, PRODUCT_IMAGE_MEDIA_PREFIX, R2_PRODUCT_IMAGE_ORIGIN } from './delivery'

// Historical uploads used PNG/JPG; repaired objects use the delivery validator's suffix.
const LEGACY_KEY = /^products\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/image-[0-9]{8}-[0-9a-f]{8}\.(?:jpg|png)$/i

export function isCleanupKey(value: unknown): value is string {
  return typeof value === 'string' && (isVerifiedProductImageKey(value) || LEGACY_KEY.test(value))
}

export function cleanupKeyFromUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.username || url.password || url.hash || (url.search && url.search !== '?retry=1')) return null
    const encoded = url.origin === R2_PRODUCT_IMAGE_ORIGIN ? url.pathname.slice(1)
      : url.origin === PRODUCT_IMAGE_DELIVERY_ORIGIN && url.pathname.startsWith(PRODUCT_IMAGE_MEDIA_PREFIX)
        ? url.pathname.slice(PRODUCT_IMAGE_MEDIA_PREFIX.length) : ''
    const key = decodeURIComponent(encoded)
    return isCleanupKey(key) ? key : null
  } catch { return null }
}

// Be conservative when protecting references: query strings do not change an R2 object.
export function referencedImageKey(value: unknown): string | null {
  if (isCleanupKey(value)) return value
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    url.search = ''
    url.hash = ''
    return cleanupKeyFromUrl(url.href)
  } catch { return null }
}

export function planImageCleanup(previous: unknown[], retained: unknown[]) {
  const protectedKeys = new Set(retained.map(referencedImageKey).filter(Boolean))
  const keys = new Set<string>()
  const skipped = new Set<string>()
  for (const value of previous) {
    if (value == null || value === '' || retained.includes(value)) continue
    const key = cleanupKeyFromUrl(value)
    if (!key) { skipped.add(String(value)); continue }
    if (!protectedKeys.has(key)) keys.add(key)
  }
  return { keys: [...keys], skipped: [...skipped] }
}
