import { requireAdminSession } from '../admin/auth'
import { supabase } from './client'

const MAX_IMAGE_DIMENSION = 2048
const IMAGE_QUALITY = 0.86
const R2_PUBLIC_BASE_URL = 'https://pub-fbd9108fe1ba4469a1ac5c6bb8204840.r2.dev'
const PRODUCT_IMAGE_FUNCTION = 'product-images-r2'

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

type ProductImageFunctionResponse = {
  key?: string
  publicUrl?: string
  deleted?: number
  error?: string
}

function isR2ProductUrl(url: string) {
  try {
    const parsed = new URL(url)
    const base = new URL(R2_PUBLIC_BASE_URL)
    return parsed.origin === base.origin && parsed.pathname.startsWith('/products/')
  } catch {
    return false
  }
}

async function invokeProductImageFunction(body: FormData | { operation: 'delete'; urls: string[] }) {
  await requireAdminSession()
  const { data, error } = await supabase.functions.invoke<ProductImageFunctionResponse>(PRODUCT_IMAGE_FUNCTION, { body })

  if (error) throw new Error(error.message || 'Product image service request failed.')
  if (data?.error) throw new Error(data.error)
  return data
}

export async function uploadProductImages({ files, productId, onProgress }: UploadProductImagesOptions): Promise<string[]> {
  if (files.length === 0) return []

  const urls: string[] = []

  for (let index = 0; index < files.length; index += 1) {
    const sourceFile = files[index]
    const file = await optimizeImage(sourceFile)
    const body = new FormData()
    body.set('operation', 'upload')
    body.set('productId', productId)
    body.set('file', file, file.name)

    let result: ProductImageFunctionResponse | null = null
    try {
      result = await invokeProductImageFunction(body)
    } catch (error) {
      throw new Error(`Could not upload ${sourceFile.name}. ${error instanceof Error ? error.message : 'Unexpected upload error.'}`)
    }

    if (!result?.publicUrl || !isR2ProductUrl(result.publicUrl)) {
      throw new Error(`Could not create a valid R2 public URL for ${sourceFile.name}.`)
    }

    urls.push(result.publicUrl)
    onProgress(index + 1, files.length)
  }

  console.log('[Hydro Blasters MNL] Generated R2 public URLs:', urls)
  return urls
}

export async function deleteProductImages(imageUrls: string[]) {
  const urls = [...new Set(imageUrls.filter(isR2ProductUrl))]
  if (urls.length === 0) return

  try {
    await invokeProductImageFunction({ operation: 'delete', urls })
  } catch (error) {
    throw new Error(`The product row was updated, but its R2 images could not be removed. ${error instanceof Error ? error.message : 'Unexpected cleanup error.'}`)
  }
}
