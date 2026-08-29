import { ReliableProductImage } from './ReliableProductImage'
import type { ImagePageContext } from '../lib/images/diagnostics'

type ProductImageFrameProps = {
  src?: string | null
  alt: string
  fallbackLabel: string
  variant: 'card' | 'main' | 'thumbnail'
  eager?: boolean
  context?: ImagePageContext
}

export function ProductImageFrame({ src, alt, fallbackLabel, variant, eager = false, context = variant === 'thumbnail' ? 'gallery' : variant === 'main' ? 'product_detail' : 'shop' }: ProductImageFrameProps) {
  const className = `product-image-frame product-image-frame-${variant}`

  if (!src) return <div className={`${className} product-image-fallback`} role="img" aria-label={fallbackLabel}>{fallbackLabel}</div>

  return <div className={className}><ReliableProductImage src={src} alt={alt} context={context} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} /></div>
}
