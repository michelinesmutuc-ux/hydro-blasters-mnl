#!/usr/bin/env node
/** Creates additive card/detail WebP derivatives. Never changes rows or deletes originals. */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const root = resolve(import.meta.dirname, '..')
const { default: sharp } = await import(pathToFileURL(resolve(root, 'node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js')).href)
function parseEnv(text) { return Object.fromEntries(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, '')] })) }
const env = { ...parseEnv(await readFile(resolve(root, '.env.local'), 'utf8')), ...process.env }
const required = (name) => { if (!env[name]) throw new Error(`Missing ${name}`); return env[name] }
const supabase = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const r2 = new S3Client({ region: 'auto', endpoint: required('R2_ENDPOINT'), forcePathStyle: true, credentials: { accessKeyId: required('R2_ACCESS_KEY_ID'), secretAccessKey: required('R2_SECRET_ACCESS_KEY') } })
const bucket = required('R2_BUCKET_NAME')
const publicBase = required('R2_PUBLIC_BASE_URL').replace(/\/$/, '')
const cacheControl = 'public, max-age=31536000, immutable'

const [{ data: products, error: productError }, { data: variants, error: variantError }] = await Promise.all([
  supabase.from('products').select('image_urls'), supabase.from('product_variants').select('image_url'),
])
if (productError || variantError) throw productError || variantError
const urls = [...new Set([...products.flatMap((row) => row.image_urls ?? []), ...variants.filter((row) => row.image_url).map((row) => row.image_url)])]
  .filter((url) => url.startsWith(`${publicBase}/`))
const keyFromUrl = (url) => decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
const derivativeKey = (key, suffix) => key.replace(/\.[^.]+$/, `-${suffix}.webp`)
async function exists(key) { try { await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); return true } catch (error) { if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return false; throw error } }
async function bodyBuffer(body) { const chunks = []; for await (const chunk of body) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks) }

let next = 0
const results = []
async function worker() {
  while (next < urls.length) {
    const index = next++
    const key = keyFromUrl(urls[index])
    const cardKey = derivativeKey(key, 'card')
    const detailKey = derivativeKey(key, 'detail')
    if (await exists(cardKey) && await exists(detailKey)) { results.push({ key, status: 'already-present' }); continue }
    try {
      const source = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      const input = await bodyBuffer(source.Body)
      const metadata = await sharp(input).metadata()
      const make = async (targetKey, dimension, quality) => {
        if (await exists(targetKey)) return 0
        const output = await sharp(input).rotate().resize({ width: dimension, height: dimension, fit: 'inside', withoutEnlargement: true }).webp({ quality, effort: 5 }).toBuffer()
        await r2.send(new PutObjectCommand({ Bucket: bucket, Key: targetKey, Body: output, ContentType: 'image/webp', CacheControl: cacheControl }))
        return output.length
      }
      const cardBytes = await make(cardKey, 800, 80)
      const detailBytes = await make(detailKey, 1600, 84)
      results.push({ key, status: 'created', sourceBytes: input.length, width: metadata.width, height: metadata.height, cardBytes, detailBytes })
      console.log(`[${index + 1}/${urls.length}] ${key}`)
    } catch (error) { results.push({ key, status: 'failed', error: error instanceof Error ? error.message : String(error) }) }
  }
}
await Promise.all(Array.from({ length: 3 }, worker))
const created = results.filter((row) => row.status === 'created')
console.log(JSON.stringify({ referenced: urls.length, created: created.length, alreadyPresent: results.filter((row) => row.status === 'already-present').length, failed: results.filter((row) => row.status === 'failed'), bytes: { source: created.reduce((n, row) => n + row.sourceBytes, 0), card: created.reduce((n, row) => n + row.cardBytes, 0), detail: created.reduce((n, row) => n + row.detailBytes, 0) } }, null, 2))
if (results.some((row) => row.status === 'failed')) process.exitCode = 1
