export const R2_PRODUCT_IMAGE_ORIGIN = 'https://pub-fbd9108fe1ba4469a1ac5c6bb8204840.r2.dev'
export const PRODUCT_IMAGE_DELIVERY_ORIGIN = 'https://hydro-blasters-mnl.pages.dev'
export const PRODUCT_IMAGE_MEDIA_PREFIX = '/media/'

const PRODUCT_IMAGE_KEY_PATTERN = /^products\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/image-[0-9]{8}-[0-9a-f]{8}(?:-repair-[0-9a-f]{12})?\.webp$/i

export function isVerifiedProductImageKey(value: string) {
  return PRODUCT_IMAGE_KEY_PATTERN.test(value) && !value.includes('..')
}

export function productImageKeyFromUrl(value: string) {
  try {
    const url = new URL(value)
    let encodedKey: string | null = null

    if (url.origin === R2_PRODUCT_IMAGE_ORIGIN && !url.search && !url.hash) {
      encodedKey = url.pathname.replace(/^\/+/, '')
    } else if (url.origin === PRODUCT_IMAGE_DELIVERY_ORIGIN && !url.hash
      && (!url.search || url.search === '?retry=1') && url.pathname.startsWith(PRODUCT_IMAGE_MEDIA_PREFIX)) {
      encodedKey = url.pathname.slice(PRODUCT_IMAGE_MEDIA_PREFIX.length)
    }

    if (!encodedKey) return null
    const key = decodeURIComponent(encodedKey)
    return isVerifiedProductImageKey(key) ? key : null
  } catch {
    return null
  }
}

export function customerProductImageUrl(value: string) {
  const key = productImageKeyFromUrl(value)
  return key ? `${PRODUCT_IMAGE_DELIVERY_ORIGIN}${PRODUCT_IMAGE_MEDIA_PREFIX}${key}` : value
}

export function singleRetryProductImageUrl(value: string) {
  const deliveredUrl = customerProductImageUrl(value)
  const key = productImageKeyFromUrl(deliveredUrl)
  return key ? `${PRODUCT_IMAGE_DELIVERY_ORIGIN}${PRODUCT_IMAGE_MEDIA_PREFIX}${key}?retry=1` : deliveredUrl
}
