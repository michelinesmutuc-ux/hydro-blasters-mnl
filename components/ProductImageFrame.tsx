'use client'

import { useState } from 'react'

type ProductImageFrameProps = {
  src?: string
  alt: string
  fallbackLabel: string
  variant: 'card' | 'main' | 'thumbnail'
}

export function ProductImageFrame({ src, alt, fallbackLabel, variant }: ProductImageFrameProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const className = `product-image-frame product-image-frame-${variant}`

  if (!src || imageFailed) return <div className={`${className} product-image-fallback`} role="img" aria-label={fallbackLabel}>{fallbackLabel}</div>

  return <div className={className}><img src={src} alt={alt} onError={() => setImageFailed(true)} /></div>
}
