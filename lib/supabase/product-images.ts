import { supabase } from './client'

const PRODUCT_IMAGE_BUCKET = 'products'
const MAX_IMAGE_DIMENSION = 2048
const IMAGE_QUALITY = 0.86

export const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/webp'] as const

function extensionForType(type: string) {
  if (type === 'image/webp') return 'webp'
  if (type === 'image/png') return 'png'
  return 'jpg'
}

function dateStamp() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}${month}${day}`
}

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

export async function uploadProductImages({ files, productId, onProgress }: UploadProductImagesOptions): Promise<string[]> {
  const paths: string[] = []
  const urls: string[] = []

  for (let index = 0; index < files.length; index += 1) {
    const sourceFile = files[index]
    const file = await optimizeImage(sourceFile)
    const randomId = crypto.randomUUID().replaceAll('-', '').slice(0, 8)
    const path = `products/${productId}/image-${dateStamp()}-${randomId}.${extensionForType(file.type)}`
    const { data: uploadData, error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })

    if (error) throw new Error(`Could not upload ${sourceFile.name}. ${error.message}`)

    const { data } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path)
    if (!data.publicUrl) throw new Error(`Could not create a public URL for ${sourceFile.name}.`)
    paths.push(uploadData.path)
    urls.push(data.publicUrl)
    onProgress(index + 1, files.length)
  }

  console.log('[Hydro Blasters MNL] Uploaded file paths:', paths)
  console.log('[Hydro Blasters MNL] Generated public URLs:', urls)
  return urls
}

function storagePathFromPublicUrl(url: string) {
  try {
    const parsed = new URL(url)
    const marker = `/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`
    const markerIndex = parsed.pathname.indexOf(marker)
    if (markerIndex === -1) return null
    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length)) || null
  } catch {
    return null
  }
}

export async function deleteProductImages(imageUrls: string[]) {
  const paths = imageUrls.map(storagePathFromPublicUrl).filter((path): path is string => Boolean(path))
  if (paths.length === 0) return

  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(paths)
  if (error) throw new Error(`The product row was updated, but its stored images could not be removed. ${error.message}`)
}
