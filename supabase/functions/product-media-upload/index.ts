import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3@3'
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authorization = request.headers.get('Authorization') ?? ''; const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } }); const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user || user.app_metadata?.role !== 'admin') return json({ error: 'Administrator access required.' }, 403)
    const { productId } = await request.json(); if (typeof productId !== 'string' || !/^[0-9a-f-]{36}$/i.test(productId)) return json({ error: 'Invalid product ID.' }, 400)
    const baseKey = `products/${productId}/image-${Date.now()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`; const bucket = Deno.env.get('R2_BUCKET_NAME')!; const publicBase = Deno.env.get('R2_PUBLIC_BASE_URL')!.replace(/\/$/, '')
    const client = new S3Client({ region: 'auto', endpoint: Deno.env.get('R2_ENDPOINT')!, forcePathStyle: true, credentials: { accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!, secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')! } })
    const sign = async (key: string) => ({ url: await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }), { expiresIn: 300 }), publicUrl: `${publicBase}/${key}` })
    return json({ original: await sign(`${baseKey}.webp`), card: await sign(`${baseKey}-card.webp`), detail: await sign(`${baseKey}-detail.webp`) })
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Upload preparation failed.' }, 500) }
})
