import { supabase } from '../supabase/client'

export const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/webp'] as const
function loadImage(file: File) { return new Promise<HTMLImageElement>((resolve, reject) => { const url = URL.createObjectURL(file); const image = new Image(); image.onload = () => { URL.revokeObjectURL(url); resolve(image) }; image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The image could not be processed.')) }; image.src = url }) }
async function webpVersion(file: File, maxDimension: number, quality: number) {
  const image = await loadImage(file); const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight)); const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser could not prepare the image.'); context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality)); if (!blob) throw new Error('This browser could not encode the image.'); return blob
}
type SignedUpload = { url: string; publicUrl: string }; type UploadPlan = { original: SignedUpload; card: SignedUpload; detail: SignedUpload }
async function put(upload: SignedUpload, body: Blob) { const response = await fetch(upload.url, { method: 'PUT', headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' }, body }); if (!response.ok) throw new Error(`R2 rejected an image upload (HTTP ${response.status}).`) }
export async function uploadProductImages({ files, productId, onProgress }: { files: File[]; productId: string; onProgress: (completed: number, total: number) => void }) {
  const urls: string[] = []
  for (let index = 0; index < files.length; index += 1) {
    const [original, card, detail] = await Promise.all([webpVersion(files[index], 2048, .86), webpVersion(files[index], 800, .8), webpVersion(files[index], 1600, .84)])
    const { data, error } = await supabase.functions.invoke<UploadPlan>('product-media-upload', { body: { productId } }); if (error || !data) throw new Error(`Could not prepare the R2 upload. ${error?.message ?? ''}`.trim())
    await Promise.all([put(data.original, original), put(data.card, card), put(data.detail, detail)]); urls.push(data.original.publicUrl); onProgress(index + 1, files.length)
  }
  return urls
}
export async function deleteProductImages(imageUrls: string[]) { if (imageUrls.length) console.warn('[Hydro Blasters MNL] Unreferenced R2 media candidates (not deleted):', imageUrls) }
