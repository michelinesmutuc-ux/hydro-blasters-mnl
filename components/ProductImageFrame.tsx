'use client'

import { useEffect, useMemo, useState } from 'react'

type ProductImageFrameProps = {
  src?: string | null
  alt: string
  fallbackLabel: string
  variant: 'card' | 'main' | 'thumbnail'
  eager?: boolean
}

const RETRY_DELAYS_MS = [450, 1400]

export function optimizedProductImageUrl(src: string, variant: 'card' | 'detail') {
  if (!src.includes('.r2.dev/')) return src
  const match = src.match(/^(.*)\.[a-z0-9]+(\?.*)?$/i)
  return match ? `${match[1]}-${variant}.webp${match[2] ?? ''}` : src
}

export function ProductImageFrame({ src, alt, fallbackLabel, variant, eager = false }: ProductImageFrameProps) {
  const className = `product-image-frame product-image-frame-${variant}`
  const candidates = useMemo(() => {
    if (!src) return []
    return [...new Set([optimizedProductImageUrl(src, variant === 'main' ? 'detail' : 'card'), src])]
  }, [src, variant])
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [retryCount, setRetryCount] = useState(0)
  const [failed, setFailed] = useState(false)
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => { setCandidateIndex(0); setRetryCount(0); setFailed(false); setRetryToken(0) }, [src, variant])

  if (!src || failed) return <div className={`${className} product-image-fallback`} role="img" aria-label={fallbackLabel}>{fallbackLabel}</div>

  function handleError() {
    if (candidateIndex + 1 < candidates.length) { setCandidateIndex((current) => current + 1); setRetryCount(0); return }
    if (retryCount < RETRY_DELAYS_MS.length) {
      const delay = RETRY_DELAYS_MS[retryCount]
      setRetryCount((current) => current + 1)
      window.setTimeout(() => setRetryToken((current) => current + 1), delay)
      return
    }
    setFailed(true)
  }

  return <div className={className}><img key={`${candidateIndex}-${retryToken}`} src={candidates[candidateIndex]} alt={alt} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" onError={handleError} /></div>
}
