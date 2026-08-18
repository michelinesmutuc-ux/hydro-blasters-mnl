#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')]
  }))
}
const env = { ...parseEnv(await readFile(resolve(import.meta.dirname, '../.env.local'), 'utf8')), ...process.env }
const required = (name) => { if (!env[name]) throw new Error(`Missing ${name}`); return env[name] }
const supabase = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const r2 = new S3Client({ region: 'auto', endpoint: required('R2_ENDPOINT'), forcePathStyle: true, credentials: { accessKeyId: required('R2_ACCESS_KEY_ID'), secretAccessKey: required('R2_SECRET_ACCESS_KEY') } })

const [{ data: products, error: productError }, { data: variants, error: variantError }] = await Promise.all([
  supabase.from('products').select('id,name,is_active,image_urls'),
  supabase.from('product_variants').select('id,product_id,image_url'),
])
if (productError || variantError) throw productError || variantError
const activeIds = new Set(products.filter((row) => row.is_active).map((row) => row.id))
const activeUrls = [...products.filter((row) => row.is_active).flatMap((row) => row.image_urls ?? []), ...variants.filter((row) => activeIds.has(row.product_id) && row.image_url).map((row) => row.image_url)]
const allUrls = [...products.flatMap((row) => row.image_urls ?? []), ...variants.filter((row) => row.image_url).map((row) => row.image_url)]
const classify = (url) => url.includes('/storage/v1/object/') ? 'supabase' : url.includes('.r2.dev/') ? 'r2' : 'other'

let continuationToken
let objectCount = 0
let totalBytes = 0
const derivativeCounts = { card: 0, detail: 0, original: 0 }
const originalKeys = []
do {
  const page = await r2.send(new ListObjectsV2Command({ Bucket: required('R2_BUCKET_NAME'), ContinuationToken: continuationToken }))
  for (const object of page.Contents ?? []) {
    objectCount += 1; totalBytes += Number(object.Size ?? 0)
    if (object.Key?.endsWith('-card.webp')) derivativeCounts.card += 1
    else if (object.Key?.endsWith('-detail.webp')) derivativeCounts.detail += 1
    else { derivativeCounts.original += 1; if (object.Key) originalKeys.push(object.Key) }
  }
  continuationToken = page.NextContinuationToken
} while (continuationToken)

const countByType = (urls) => urls.reduce((counts, url) => ({ ...counts, [classify(url)]: (counts[classify(url)] ?? 0) + 1 }), {})
const publicBase = required('R2_PUBLIC_BASE_URL').replace(/\/$/, '')
const referencedKeys = new Set(allUrls.filter((url) => url.startsWith(`${publicBase}/`)).map((url) => decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))))
console.log(JSON.stringify({
  generatedAt: new Date().toISOString(), products: products.length, activeProducts: activeIds.size,
  references: { active: activeUrls.length, activeUnique: new Set(activeUrls).size, activeByHost: countByType(activeUrls), all: allUrls.length, allByHost: countByType(allUrls) },
  r2: { objectCount, totalBytes, totalGiB: Number((totalBytes / 1024 ** 3).toFixed(3)), derivativeCounts, unreferencedOriginalCandidates: originalKeys.filter((key) => !referencedKeys.has(key)) },
  activeSupabaseUrls: [...new Set(activeUrls.filter((url) => classify(url) === 'supabase'))],
}, null, 2))
