import { requireAdminSession } from '../admin/auth'
import { productImageKeyFromUrl, PRODUCT_IMAGE_DELIVERY_ORIGIN, PRODUCT_IMAGE_MEDIA_PREFIX } from '../images/delivery'
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

export async function deleteProductImages(imageUrls: string[]) {
  const keys = imageUrls.map(productImageKeyFromUrl).filter((key): key is string => Boolean(key))
  if (keys.length === 0) return

  const session = await requireAdminSession()
  const response = await fetch(PRODUCT_IMAGE_ENDPOINT, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${session.access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ keys }),
  })
  const result = await responseJson(response)

  if (!response.ok) throw new Error(`The product row was updated, but its R2 images could not be removed. ${result.error || `Cleanup service returned ${response.status}.`}`)
}
