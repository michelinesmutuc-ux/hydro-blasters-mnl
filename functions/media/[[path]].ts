type R2Object = {
  body: ReadableStream
  httpEtag: string
  size: number
  uploaded: Date
}

type R2ObjectMetadata = Omit<R2Object, 'body'>

type R2BucketBinding = {
  get: (key: string) => Promise<R2Object | null>
  head: (key: string) => Promise<R2ObjectMetadata | null>
}

type PagesContext = {
  request: Request
  env: { PRODUCT_IMAGES_R2?: R2BucketBinding }
  waitUntil?: (promise: Promise<unknown>) => void
}

type EdgeCache = {
  match: (request: Request) => Promise<Response | undefined>
  put: (request: Request, response: Response) => Promise<void>
}

const MEDIA_PREFIX = '/media/'
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const PRODUCT_IMAGE_KEY_PATTERN = /^products\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/image-[0-9]{8}-[0-9a-f]{8}(?:-repair-[0-9a-f]{12})?\.webp$/i

export function permittedMediaKey(requestUrl: string) {
  try {
    const url = new URL(requestUrl)
    if (!url.pathname.startsWith(MEDIA_PREFIX)) return null
    if (url.hash || (url.search && url.search !== '?retry=1')) return null
    const encodedKey = url.pathname.slice(MEDIA_PREFIX.length)
    const key = decodeURIComponent(encodedKey)
    if (!PRODUCT_IMAGE_KEY_PATTERN.test(key) || key.includes('..')) return null
    return key
  } catch {
    return null
  }
}

function headersFor(object: R2ObjectMetadata) {
  return new Headers({
    'content-type': 'image/webp',
    'content-length': String(object.size),
    'cache-control': IMMUTABLE_CACHE_CONTROL,
    etag: object.httpEtag,
    'last-modified': object.uploaded.toUTCString(),
    'x-content-type-options': 'nosniff',
  })
}

function cacheKeyFor(request: Request, key: string) {
  const url = new URL(request.url)
  url.pathname = `${MEDIA_PREFIX}${key}`
  url.search = ''
  url.hash = ''
  return new Request(url.toString(), { method: 'GET' })
}

function defaultCache() {
  return (globalThis as typeof globalThis & { caches?: { default?: EdgeCache } }).caches?.default
}

export async function serveMedia({ request, env, waitUntil }: PagesContext, cache: EdgeCache | undefined = defaultCache()) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed.', { status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' } })
  }
  if (!env.PRODUCT_IMAGES_R2) return new Response('Image storage is unavailable.', { status: 503, headers: { 'cache-control': 'no-store' } })

  const key = permittedMediaKey(request.url)
  if (!key) return new Response('Invalid image path.', { status: 400, headers: { 'cache-control': 'no-store' } })

  if (request.method === 'HEAD') {
    const object = await env.PRODUCT_IMAGES_R2.head(key)
    return object
      ? new Response(null, { status: 200, headers: headersFor(object) })
      : new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })
  }

  const cacheKey = cacheKeyFor(request, key)
  const cached = await cache?.match(cacheKey)
  if (cached) {
    const response = new Response(cached.body, cached)
    response.headers.set('x-image-cache', 'HIT')
    return response
  }

  const object = await env.PRODUCT_IMAGES_R2.get(key)
  if (!object) return new Response('Image not found.', { status: 404, headers: { 'cache-control': 'no-store' } })

  const response = new Response(object.body, { status: 200, headers: headersFor(object) })
  response.headers.set('x-image-cache', 'MISS')
  if (cache) {
    const cacheWrite = cache.put(cacheKey, response.clone()).catch(() => undefined)
    if (waitUntil) waitUntil(cacheWrite)
    else await cacheWrite
  }
  return response
}

export async function onRequest(context: PagesContext) {
  return serveMedia(context)
}
