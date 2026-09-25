import { requireAdminSession } from '../admin/auth'
import { productImageKeyFromUrl, PRODUCT_IMAGE_DELIVERY_ORIGIN, PRODUCT_IMAGE_MEDIA_PREFIX } from '../images/delivery'
import { planImageCleanup } from '../images/cleanup'
import { optimizeImage } from '../images/optimize'

export { acceptedImageTypes } from '../images/optimize'

const PRODUCT_IMAGE_ENDPOINT = '/api/admin/product-images'

type UploadProductImagesOptions = {
  files: File[]
  productId: string
  onProgress: (completed: number, total: number) => void
}

type ProductImageUploadResponse = {
  key?: string
  publicUrl?: string
  error?: string
}

async function responseJson(response: Response): Promise<ProductImageUploadResponse> {
  try {
    return await response.json() as ProductImageUploadResponse
  } catch {
    return {}
  }
}

export async function uploadProductImages({ files, productId, onProgress }: UploadProductImagesOptions): Promise<string[]> {
  if (files.length === 0) return []

  const session = await requireAdminSession()
  const urls: string[] = []

  for (let index = 0; index < files.length; index += 1) {
    const sourceFile = files[index]
    const file = await optimizeImage(sourceFile)
    const body = new FormData()
    body.set('productId', productId)
    body.set('file', file, file.name)

    const response = await fetch(PRODUCT_IMAGE_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${session.access_token}` },
      body,
    })
    const result = await responseJson(response)

    if (!response.ok) throw new Error(`Could not upload ${sourceFile.name}. ${result.error || `Upload service returned ${response.status}.`}`)
    if (!result.publicUrl) throw new Error(`Could not create a public URL for ${sourceFile.name}.`)
    if (!result.publicUrl.startsWith(`${PRODUCT_IMAGE_DELIVERY_ORIGIN}${PRODUCT_IMAGE_MEDIA_PREFIX}products/`) || !productImageKeyFromUrl(result.publicUrl)) throw new Error(`Upload service returned an unexpected image URL for ${sourceFile.name}.`)

    urls.push(result.publicUrl)
    onProgress(index + 1, files.length)
  }

  console.log('[Hydro Blasters MNL] Generated product image URLs:', urls)
  return urls
}

export async function deleteProductImages(imageUrls: unknown[], retainedImageUrls: unknown[] = []) {
  const { keys, skipped } = planImageCleanup(imageUrls, retainedImageUrls)
  const warnings = skipped.map((value) => `Unrecognized image reference left untouched: ${value}`)
  if (skipped.length) console.warn('[Product image cleanup] Unrecognized references', { skipped })
  if (keys.length) {
    try {
      const session = await requireAdminSession()
      // Stay within the endpoint's batch limit without discarding later candidates.
      for (let offset = 0; offset < keys.length; offset += 100) {
        const batch = keys.slice(offset, offset + 100)
        const response = await fetch(PRODUCT_IMAGE_ENDPOINT, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ keys: batch }),
        })
        const result = await responseJson(response)
        if (!response.ok) throw new Error(result.error || `Cleanup service returned ${response.status}.`)
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Cleanup request failed.'
      console.error('[Product image cleanup] Failed', { keys, reason })
      warnings.push(`${reason} Requested keys: ${keys.join(', ')}`)
    }
  }
  if (warnings.length) throw new Error(`Storage cleanup needs attention. ${warnings.join(' ')}`)
}
