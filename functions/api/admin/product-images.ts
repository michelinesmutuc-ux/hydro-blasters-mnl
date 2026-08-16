type R2BucketBinding = {
  put: (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }) => Promise<unknown>
  delete: (keys: string | string[]) => Promise<void>
}

type PagesEnv = {
  PRODUCT_IMAGES_R2: R2BucketBinding
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string
  R2_PUBLIC_BASE_URL?: string
}

type PagesContext = {
  request: Request
  env: PagesEnv
}

const DEFAULT_PUBLIC_BASE_URL = 'https://pub-fbd9108fe1ba4469a1ac5c6bb8204840.r2.dev'
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function getPublicBaseUrl(env: PagesEnv) {
  return (env.R2_PUBLIC_BASE_URL?.trim() || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '')
}

function supabaseConfig(env: PagesEnv) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim()
  if (!url || !key) throw new Error('Supabase runtime environment variables are not configured for the upload function.')
  return { url: url.replace(/\/+$/, ''), key }
}

async function requireAdmin(request: Request, env: PagesEnv) {
  const authorization = request.headers.get('authorization')?.trim()
  if (!authorization?.toLowerCase().startsWith('bearer ')) return { ok: false as const, response: json({ error: 'Authentication required.' }, 401) }

  let config: ReturnType<typeof supabaseConfig>
  try {
    config = supabaseConfig(env)
  } catch (error) {
    return { ok: false as const, response: json({ error: error instanceof Error ? error.message : 'Server authentication is not configured.' }, 500) }
  }

  const userResponse = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      authorization,
      apikey: config.key,
    },
  })

  if (!userResponse.ok) return { ok: false as const, response: json({ error: 'Your administrator session is no longer valid.' }, 401) }

  const user = await userResponse.json() as { app_metadata?: { role?: string } }
  if (user.app_metadata?.role !== 'admin') return { ok: false as const, response: json({ error: 'Administrator access is required.' }, 403) }

  return { ok: true as const }
}

function normalizeProductId(value: FormDataEntryValue | null) {
  const productId = typeof value === 'string' ? value.trim() : ''
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId) ? productId : null
}

function extensionForType(type: string) {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

function dateStamp() {
  const now = new Date()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  return `${now.getUTCFullYear()}${month}${day}`
}

function safeProductKey(value: unknown) {
  if (typeof value !== 'string') return null
  const key = value.trim().replace(/^\/+/, '')
  if (!/^products\/[0-9a-f-]{36}\/image-[0-9]{8}-[0-9a-f]{8}\.(?:jpg|png|webp)$/i.test(key)) return null
  if (key.includes('..')) return null
  return key
}

export async function onRequestPost({ request, env }: PagesContext) {
  const auth = await requireAdmin(request, env)
  if (!auth.ok) return auth.response
  if (!env.PRODUCT_IMAGES_R2) return json({ error: 'R2 binding PRODUCT_IMAGES_R2 is not configured.' }, 500)

  const formData = await request.formData()
  const productId = normalizeProductId(formData.get('productId'))
  const file = formData.get('file')

  if (!productId) return json({ error: 'A valid product ID is required.' }, 400)
  if (!(file instanceof File)) return json({ error: 'An image file is required.' }, 400)
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return json({ error: 'Only JPG, PNG, and WebP images are allowed.' }, 415)
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return json({ error: 'Image must be larger than 0 bytes and no more than 12 MB.' }, 413)

  const randomId = crypto.randomUUID().replaceAll('-', '').slice(0, 8)
  const key = `products/${productId}/image-${dateStamp()}-${randomId}.${extensionForType(file.type)}`
  const bytes = await file.arrayBuffer()

  await env.PRODUCT_IMAGES_R2.put(key, bytes, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })

  return json({ key, publicUrl: `${getPublicBaseUrl(env)}/${key}` }, 201)
}

export async function onRequestDelete({ request, env }: PagesContext) {
  const auth = await requireAdmin(request, env)
  if (!auth.ok) return auth.response
  if (!env.PRODUCT_IMAGES_R2) return json({ error: 'R2 binding PRODUCT_IMAGES_R2 is not configured.' }, 500)

  let body: { keys?: unknown } = {}
  try {
    body = await request.json() as { keys?: unknown }
  } catch {
    return json({ error: 'A JSON request body is required.' }, 400)
  }

  if (!Array.isArray(body.keys)) return json({ error: 'keys must be an array.' }, 400)
  const keys = body.keys.map(safeProductKey).filter((key): key is string => Boolean(key))
  if (keys.length !== body.keys.length) return json({ error: 'One or more image keys are invalid.' }, 400)
  if (keys.length === 0) return json({ deleted: 0 })
  if (keys.length > 100) return json({ error: 'No more than 100 images can be deleted in one request.' }, 400)

  await env.PRODUCT_IMAGES_R2.delete(keys)
  return json({ deleted: keys.length })
}
