type ProductImageFrameProps = {
  src?: string | null
  alt: string
  fallbackLabel: string
  variant: 'card' | 'main' | 'thumbnail'
}

export function ProductImageFrame({ src, alt, fallbackLabel, variant }: ProductImageFrameProps) {
  const className = `product-image-frame product-image-frame-${variant}`

  if (!src) return <div className={`${className} product-image-fallback`} role="img" aria-label={fallbackLabel}>{fallbackLabel}</div>

  return <div className={className}><img src={src} alt={alt} /></div>
}
