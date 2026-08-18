type ProductImageFrameProps = {
  src?: string | null
  alt: string
  fallbackLabel: string
  variant: 'card' | 'main' | 'thumbnail'
  eager?: boolean
}

export function ProductImageFrame({ src, alt, fallbackLabel, variant, eager = false }: ProductImageFrameProps) {
  const className = `product-image-frame product-image-frame-${variant}`

  if (!src) return <div className={`${className} product-image-fallback`} role="img" aria-label={fallbackLabel}>{fallbackLabel}</div>

  return <div className={className}><img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : 'auto'} /></div>
}
