import { isCleanupKey, referencedImageKey } from '../../../lib/images/cleanup'

type R2BucketBinding = {
  put: (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }) => Promise<unknown>
  delete: (keys: string | string[]) => Promise<void>
}

type PagesEnv = {
  PRODUCT_IMAGES_R2: R2BucketBinding
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string
  IMAGE_DELIVERY_BASE_URL?: string
}

type PagesContext = {
  request: Request
  env: PagesEnv
}

const DEFAULT_IMAGE_DELIVERY_BASE_URL = 'https://hydro-blasters-mnl.pages.dev/media'
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function getPublicBaseUrl(env: PagesEnv) {
  return (env.IMAGE_DELIVERY_BASE_URL?.trim() || DEFAULT_IMAGE_DELIVERY_BASE_URL).replace(/\/+$/, '')
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

function detectedImageType(bytes: Uint8Array) {
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  return null
}

function dateStamp() {
  const now = new Date()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  return `${now.getUTCFullYear()}${month}${day}`
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

  const bytes = await file.arrayBuffer()
  const actualType = detectedImageType(new Uint8Array(bytes))
  if (!actualType) return json({ error: 'The uploaded file is not a valid JPG, PNG, or WebP image.' }, 415)
  if (actualType !== file.type) return json({ error: `The image contents do not match the declared ${file.type} format. Nothing was uploaded.` }, 415)

  const randomId = crypto.randomUUID().replaceAll('-', '').slice(0, 8)
  const key = `products/${productId}/image-${dateStamp()}-${randomId}.${extensionForType(actualType)}`

  await env.PRODUCT_IMAGES_R2.put(key, bytes, {
    httpMetadata: {
      contentType: actualType,
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
  const invalidKeys = body.keys.filter((key) => !isCleanupKey(key))
  if (invalidKeys.length) {
    console.warn('[Product image cleanup] Invalid keys', { invalidKeys })
    return json({ error: `Invalid image keys: ${invalidKeys.map((key) => JSON.stringify(key)).join(', ')}`, invalidKeys }, 400)
  }
  const keys = [...new Set(body.keys as string[])]
  if (keys.length === 0) return json({ deleted: 0 })
  if (keys.length > 100) return json({ error: 'No more than 100 images can be deleted in one request.' }, 400)

  // Read persisted references with the verified admin's credentials, not client-supplied exclusions.
  // Shared images in other products and variants must also survive cleanup.
  const referenced = new Set<string>()
  try {
    const config = supabaseConfig(env)
    for (const [table, columns] of [['products', 'id,image_urls'], ['product_variants', 'id,image_url']]) {
      let offset = 0
      while (true) {
        const response = await fetch(`${config.url}/rest/v1/${table}?select=${columns}&order=id&limit=500&offset=${offset}`, {
          headers: { authorization: request.headers.get('authorization')!, apikey: config.key },
        })
        if (!response.ok) throw new Error(`Could not check ${table} references (HTTP ${response.status}).`)
        const rows = await response.json() as { image_urls?: unknown[]; image_url?: unknown }[]
        if (!Array.isArray(rows)) throw new Error(`Invalid ${table} reference response.`)
        if (rows.length === 0) break
        for (const row of rows) {
          const values = table === 'products' ? row.image_urls : [row.image_url]
          if (table === 'products' ? row.image_urls === undefined : row.image_url === undefined) {
            throw new Error(`Missing ${table} image references.`)
          }
          if (values != null && !Array.isArray(values)) throw new Error(`Invalid ${table} image references.`)
          for (const value of values ?? []) {
            const key = referencedImageKey(value)
            if (key) referenced.add(key)
          }
        }
        offset += rows.length
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Reference check failed.'
    console.error('[Product image cleanup] Reference check failed; nothing deleted', { keys, reason })
    return json({ error: `${reason} No images were deleted.`, keys }, 503)
  }

  const deletedKeys: string[] = []
  const retainedKeys = keys.filter((key) => referenced.has(key))
  const failedKeys: string[] = []
  for (const key of keys) {
    if (referenced.has(key)) continue
    try {
      await env.PRODUCT_IMAGES_R2.delete(key)
      deletedKeys.push(key)
    } catch (error) {
      failedKeys.push(key)
      console.error('[Product image cleanup] R2 delete failed', { key, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return json({ deleted: deletedKeys.length, deletedKeys, retainedKeys, failedKeys,
    ...(failedKeys.length ? { error: `Could not delete R2 image keys: ${failedKeys.join(', ')}` } : {}),
  }, failedKeys.length ? 502 : 200)
}
