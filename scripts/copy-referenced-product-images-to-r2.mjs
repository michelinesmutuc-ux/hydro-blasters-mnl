#!/usr/bin/env node

/**
 * Phase 1 only: copy currently referenced product images from Supabase Storage
 * to R2 and verify every destination. This script never updates Supabase rows
 * and never deletes source or destination objects.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const ARTIFACT_DIRECTORY = resolve(PROJECT_ROOT, 'artifacts/r2-product-image-copy');
const ARTIFACT_PATH = resolve(ARTIFACT_DIRECTORY, 'referenced-image-url-mapping.json');
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const CONCURRENCY = 4;
const BATCH_SIZE = Number.parseInt(process.env.R2_MIGRATION_BATCH_SIZE ?? '0', 10) || Number.POSITIVE_INFINITY;

function parseDotEnv(text) {
  const values = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

async function loadLocalEnvironment() {
  const localEnvironmentPath = resolve(PROJECT_ROOT, '.env.local');

  try {
    const localValues = parseDotEnv(await readFile(localEnvironmentPath, 'utf8'));
    for (const [key, value] of Object.entries(localValues)) {
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function asPublicUrl(baseUrl, objectKey) {
  const base = baseUrl.replace(/\/$/, '');
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  return `${base}/${encodedKey}`;
}

function contentTypeFor(objectKey, sourceContentType) {
  if (sourceContentType) return sourceContentType.split(';', 1)[0].trim();

  const extension = objectKey.split('.').pop()?.toLowerCase();
  return {
    avif: 'image/avif',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  }[extension] ?? 'application/octet-stream';
}

function supabaseObjectKey(sourceUrl) {
  const url = new URL(sourceUrl);
  const marker = '/storage/v1/object/public/products/';
  const markerIndex = url.pathname.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error('URL is not a public object URL from the Supabase products bucket');
  }

  const encodedKey = url.pathname.slice(markerIndex + marker.length);
  const objectKey = encodedKey.split('/').map(decodeURIComponent).join('/');

  if (!objectKey.startsWith('products/') || objectKey.startsWith('/') || objectKey.includes('..')) {
    throw new Error(`Unsafe or unexpected object key: ${objectKey}`);
  }

  return objectKey;
}

async function responseBuffer(response, context) {
  if (!response.ok) {
    throw new Error(`${context} failed with HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function streamBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function isMissingObjectError(error) {
  const status = error?.$metadata?.httpStatusCode;
  return status === 404 || error?.name === 'NotFound' || error?.Code === 'NoSuchKey';
}

async function getR2ObjectBuffer(r2, bucket, objectKey) {
  const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  if (!response.Body) throw new Error('R2 returned an object without a body');
  return streamBuffer(response.Body);
}

async function existingObjectMatches(r2, bucket, objectKey, sourceBuffer, sourceHash) {
  try {
    const head = await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    if (Number(head.ContentLength) !== sourceBuffer.byteLength) return false;

    const destinationBuffer = await getR2ObjectBuffer(r2, bucket, objectKey);
    return destinationBuffer.byteLength === sourceBuffer.byteLength && hash(destinationBuffer) === sourceHash;
  } catch (error) {
    if (isMissingObjectError(error)) return false;
    throw error;
  }
}

async function verifyDestination({ r2, bucket, objectKey, publicUrl, sourceBuffer, sourceHash }) {
  const head = await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
  if (Number(head.ContentLength) !== sourceBuffer.byteLength) {
    throw new Error(`R2 HeadObject byte length mismatch: expected ${sourceBuffer.byteLength}, got ${head.ContentLength}`);
  }

  const r2Buffer = await getR2ObjectBuffer(r2, bucket, objectKey);
  if (r2Buffer.byteLength !== sourceBuffer.byteLength || hash(r2Buffer) !== sourceHash) {
    throw new Error('R2 object content does not match the source SHA-256');
  }

  const publicResponse = await fetch(`${publicUrl}?phase1verify=${sourceHash}`, { cache: 'no-store' });
  const publicBuffer = await responseBuffer(publicResponse, 'R2 public URL verification');
  if (publicBuffer.byteLength !== sourceBuffer.byteLength || hash(publicBuffer) !== sourceHash) {
    throw new Error('R2 public object content does not match the source SHA-256');
  }
}

async function fetchReferencedUrls(supabase) {
  const [{ data: products, error: productsError }, { data: variants, error: variantsError }] = await Promise.all([
    supabase.from('products').select('id, image_urls'),
    supabase.from('product_variants').select('id, product_id, image_url').not('image_url', 'is', null),
  ]);

  if (productsError) throw new Error(`Could not read products.image_urls: ${productsError.message}`);
  if (variantsError) throw new Error(`Could not read product_variants.image_url: ${variantsError.message}`);

  const productUrls = (products ?? []).flatMap((product) =>
    Array.isArray(product.image_urls)
      ? product.image_urls.filter((url) => typeof url === 'string' && url.trim())
      : [],
  );
  const variantUrls = (variants ?? [])
    .map((variant) => variant.image_url)
    .filter((url) => typeof url === 'string' && url.trim());

  return { productUrls, variantUrls, uniqueUrls: [...new Set([...productUrls, ...variantUrls])] };
}

async function mapWithConcurrency(items, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, runWorker));
  return results;
}

async function loadMigrationArtifact() {
  try {
    return JSON.parse(await readFile(ARTIFACT_PATH, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function saveMigrationArtifact(migration) {
  await mkdir(ARTIFACT_DIRECTORY, { recursive: true });
  await writeFile(ARTIFACT_PATH, `${JSON.stringify(migration, null, 2)}\n`, 'utf8');
}

async function main() {
  await loadLocalEnvironment();

  const supabaseUrl = requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const endpoint = requiredEnvironment('R2_ENDPOINT');
  const bucket = requiredEnvironment('R2_BUCKET_NAME');
  const publicBaseUrl = requiredEnvironment('R2_PUBLIC_BASE_URL');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const r2 = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnvironment('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnvironment('R2_SECRET_ACCESS_KEY'),
    },
  });

  const { productUrls, variantUrls, uniqueUrls } = await fetchReferencedUrls(supabase);
  console.log(`Product URL references found: ${productUrls.length}`);
  console.log(`Variant URL references found: ${variantUrls.length}`);
  console.log(`Unique referenced images: ${uniqueUrls.length}`);

  const previousMigration = await loadMigrationArtifact();
  const migration = {
    phase: 'Phase 1: copy and verify only',
    generatedAt: new Date().toISOString(),
    sourceBucket: 'products',
    destinationBucket: bucket,
    productUrlReferences: productUrls.length,
    variantUrlReferences: variantUrls.length,
    uniqueReferencedImages: uniqueUrls.length,
    mappings: Array.isArray(previousMigration?.mappings) ? previousMigration.mappings : [],
  };
  const completedUrls = new Set(
    migration.mappings
      .filter((result) => result.status === 'copied-and-verified' || result.status === 'already-present-and-verified')
      .map((result) => result.sourceUrl),
  );
  const pendingUrls = uniqueUrls.filter((sourceUrl) => !completedUrls.has(sourceUrl));
  const currentBatch = pendingUrls.slice(0, BATCH_SIZE);

  console.log(`Previously verified: ${completedUrls.size}`);
  console.log(`Images remaining: ${pendingUrls.length}`);
  console.log(`Images in this run: ${currentBatch.length}`);

  const batchResults = await mapWithConcurrency(currentBatch, async (sourceUrl, index) => {
    const publicUrl = sourceUrl;
    let objectKey;

    try {
      objectKey = supabaseObjectKey(sourceUrl);
      const sourceResponse = await fetch(sourceUrl, { cache: 'no-store' });
      const sourceBuffer = await responseBuffer(sourceResponse, 'Supabase source download');
      const sourceHash = hash(sourceBuffer);
      const destinationPublicUrl = asPublicUrl(publicBaseUrl, objectKey);
      const alreadyMatches = await existingObjectMatches(r2, bucket, objectKey, sourceBuffer, sourceHash);

      if (!alreadyMatches) {
        await r2.send(new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: sourceBuffer,
          ContentLength: sourceBuffer.byteLength,
          ContentType: contentTypeFor(objectKey, sourceResponse.headers.get('content-type')),
          CacheControl: CACHE_CONTROL,
        }));
      }

      await verifyDestination({
        r2,
        bucket,
        objectKey,
        publicUrl: destinationPublicUrl,
        sourceBuffer,
        sourceHash,
      });

      const result = {
        sourceUrl,
        destinationPublicUrl,
        objectKey,
        sourceByteLength: sourceBuffer.byteLength,
        sourceSha256: sourceHash,
        status: alreadyMatches ? 'already-present-and-verified' : 'copied-and-verified',
      };
      console.log(`[${index + 1}/${currentBatch.length}] ${result.status}: ${objectKey}`);
      return result;
    } catch (error) {
      const result = {
        sourceUrl,
        destinationPublicUrl: objectKey ? asPublicUrl(publicBaseUrl, objectKey) : null,
        objectKey: objectKey ?? null,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
      console.error(`[${index + 1}/${currentBatch.length}] failed: ${sourceUrl} — ${result.error}`);
      return result;
    }
  });

  const batchResultByUrl = new Map(batchResults.map((result) => [result.sourceUrl, result]));
  migration.mappings = uniqueUrls
    .map((sourceUrl) => batchResultByUrl.get(sourceUrl) ?? migration.mappings.find((result) => result.sourceUrl === sourceUrl))
    .filter(Boolean);
  await saveMigrationArtifact(migration);

  const copied = migration.mappings.filter((result) => result.status === 'copied-and-verified').length;
  const alreadyVerified = migration.mappings.filter((result) => result.status === 'already-present-and-verified').length;
  const failures = migration.mappings.filter((result) => result.status === 'failed');
  const remaining = uniqueUrls.length - copied - alreadyVerified;

  console.log('\nPhase 1 migration report');
  console.log(`Product URL references found: ${productUrls.length}`);
  console.log(`Variant URL references found: ${variantUrls.length}`);
  console.log(`Unique referenced images: ${uniqueUrls.length}`);
  console.log(`Copied successfully: ${copied}`);
  console.log(`Already present and verified: ${alreadyVerified}`);
  console.log(`Verification failures: ${failures.length}`);
  console.log(`Download failures: ${failures.filter((result) => result.error?.includes('Supabase source download')).length}`);
  console.log(`Upload failures: ${failures.filter((result) => !result.error?.includes('Supabase source download')).length}`);
  console.log(`Images remaining: ${remaining}`);
  console.log(`Mapping artifact: ${ARTIFACT_PATH}`);

  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Phase 1 did not start: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
