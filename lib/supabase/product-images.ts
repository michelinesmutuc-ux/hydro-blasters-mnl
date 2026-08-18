import { requireAdminSession } from '../admin/auth'

const MAX_IMAGE_DIMENSION = 2048
const IMAGE_QUALITY = 0.86
const R2_PUBLIC_BASE_URL = 'https://pub-fbd9108fe1ba4469a1ac5c6bb8204840.r2.dev'
const PRODUCT_IMAGE_ENDPOINT = '/api/admin/product-images'

export const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/webp'] as const

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(imageUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl)
      reject(new Error('The image could not be processed.'))
    }
    image.src = imageUrl
  })
}

async function optimizeImage(file: File) {
  try {
    const image = await loadImage(file)
    const largestDimension = Math.max(image.naturalWidth, image.naturalHeight)
    const scale = largestDimension > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / largestDimension : 1
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file

    context.drawImage(image, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', IMAGE_QUALITY))
    return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' }) : file
  } catch {
    return file
  }
}

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
    if (!result.publicUrl.startsWith(`${R2_PUBLIC_BASE_URL}/products/`)) throw new Error(`Upload service returned an unexpected image URL for ${sourceFile.name}.`)

    urls.push(result.publicUrl)
    onProgress(index + 1, files.length)
  }

  console.log('[Hydro Blasters MNL] Generated R2 public URLs:', urls)
  return urls
}

function r2KeyFromPublicUrl(url: string) {
  try {
    const parsed = new URL(url)
    const publicBase = new URL(R2_PUBLIC_BASE_URL)
    if (parsed.origin !== publicBase.origin) return null
    const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
    if (!key.startsWith('products/')) return null
    return key || null
  } catch {
    return null
  }
}

export async function deleteProductImages(imageUrls: string[]) {
  const keys = imageUrls.map(r2KeyFromPublicUrl).filter((key): key is string => Boolean(key))
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
