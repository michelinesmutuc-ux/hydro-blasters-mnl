'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { customerProductImageUrl, productImageKeyFromUrl, singleRetryProductImageUrl } from '../lib/images/delivery'
import { imageSupportCode, recordImageDiagnostic, type ImagePageContext } from '../lib/images/diagnostics'

type ReliableProductImageProps = {
  src: string
  alt: string
  context: ImagePageContext
  loading?: 'eager' | 'lazy'
  fetchPriority?: 'high' | 'low' | 'auto'
  className?: string
  failureLabel?: string
}

const RETRIED_IMAGES_KEY = 'hydro-image-retries'
const RETRY_DELAY_MS = 1000

function retryWasConsumed(key: string) {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(RETRIED_IMAGES_KEY) ?? '[]')
    return Array.isArray(parsed) && parsed.includes(key)
  } catch {
    return false
  }
}

function consumeRetry(key: string) {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(RETRIED_IMAGES_KEY) ?? '[]')
    const current = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
    if (!current.includes(key)) window.sessionStorage.setItem(RETRIED_IMAGES_KEY, JSON.stringify([...current, key].slice(-250)))
  } catch {}
}

export function ReliableProductImage({ src, alt, context, loading = 'lazy', fetchPriority = 'auto', className, failureLabel = 'Photo couldn’t load. Refresh page.' }: ReliableProductImageProps) {
  const deliveredSrc = useMemo(() => customerProductImageUrl(src), [src])
  const objectKey = useMemo(() => productImageKeyFromUrl(deliveredSrc), [deliveredSrc])
  const [displaySrc, setDisplaySrc] = useState(deliveredSrc)
  const [state, setState] = useState<'initial' | 'waiting' | 'retrying' | 'failed'>('initial')
  const hydrated = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failureCount = useRef(0)

  useEffect(() => {
    hydrated.current = true
    return () => { hydrated.current = false }
  }, [])

  useEffect(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current)
    retryTimer.current = null
    failureCount.current = 0
    setDisplaySrc(deliveredSrc)
    setState('initial')
  }, [deliveredSrc])

  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current) }, [])

  function diagnostic(eventCode: 'image_load_failed' | 'image_retry_started' | 'image_retry_succeeded' | 'image_retry_failed', image: HTMLImageElement) {
    void recordImageDiagnostic({
      eventCode,
      pageContext: context,
      src: deliveredSrc,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      failureCount: failureCount.current,
      hydrated: hydrated.current,
    })
  }

  function handleError(image: HTMLImageElement) {
    if (state === 'failed' || state === 'waiting') return
    failureCount.current += 1

    if (state === 'retrying') {
      diagnostic('image_retry_failed', image)
      setState('failed')
      return
    }

    diagnostic('image_load_failed', image)
    if (!objectKey || retryWasConsumed(objectKey)) {
      setState('failed')
      return
    }

    consumeRetry(objectKey)
    setState('waiting')
    retryTimer.current = setTimeout(() => {
      diagnostic('image_retry_started', image)
      setDisplaySrc(singleRetryProductImageUrl(deliveredSrc))
      setState('retrying')
      retryTimer.current = null
    }, RETRY_DELAY_MS)
  }

  function handleLoad(image: HTMLImageElement) {
    if (state !== 'retrying') return
    diagnostic('image_retry_succeeded', image)
    setState('initial')
  }

  if (state === 'failed') {
    return <span className={`image-load-failure${className ? ` ${className}` : ''}`} role="img" aria-label={`${alt}. ${failureLabel}`}>{failureLabel}<small>Support: {imageSupportCode()}</small></span>
  }
  if (state === 'waiting') {
    return <span className={`image-load-failure image-load-retrying${className ? ` ${className}` : ''}`} role="status">Retrying photo…</span>
  }

  return <img className={className} src={displaySrc} alt={alt} loading={loading} decoding="async" fetchPriority={fetchPriority} onError={(event) => handleError(event.currentTarget)} onLoad={(event) => handleLoad(event.currentTarget)} />
}
