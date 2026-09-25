const MAX_IMAGE_DIMENSION = 2048
const IMAGE_QUALITY = 0.86

export const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/webp'] as const

function loadImage(file: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image decoding failed.')) }
    image.src = url
  })
}

async function isWebp(blob: Blob | null): Promise<boolean> {
  if (!blob || blob.type !== 'image/webp') return false
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  return bytes.length === 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
}

export async function optimizeImage(file: File): Promise<File> {
  let image: HTMLImageElement
  try {
    image = await loadImage(file)
  } catch {
    throw new Error(`Could not read ${file.name}. The image may be corrupt; please choose a valid PNG, JPG, or WebP image.`)
  }
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error(`Could not convert ${file.name}: this browser could not create an image canvas.`)
  context.drawImage(image, 0, 0, width, height)

  try {
    // Browsers without a WebP canvas encoder silently return PNG instead.
    let blob = await new Promise<Blob | null>((resolve) => {
      try { canvas.toBlob(resolve, 'image/webp', IMAGE_QUALITY) } catch { resolve(null) }
    })
    if (!await isWebp(blob)) {
      // Load a real WebP encoder only when the native encoder is unavailable.
      const { default: encode } = await import('@jsquash/webp/encode')
      blob = new Blob([await encode(context.getImageData(0, 0, width, height), { quality: IMAGE_QUALITY * 100 })], { type: 'image/webp' })
    }
    if (!blob || !await isWebp(blob)) throw new Error('The encoder did not produce WebP bytes.')
    const decoded = await loadImage(blob)
    if (decoded.naturalWidth !== width || decoded.naturalHeight !== height) throw new Error('Converted image dimensions did not match.')
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' })
  } catch {
    throw new Error(`Could not convert ${file.name} to WebP. Please retry; if the problem persists, try another browser or export the image again.`)
  }
}
