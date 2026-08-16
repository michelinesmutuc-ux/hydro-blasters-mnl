#!/usr/bin/env node

/**
 * Phase 2A only: replace exact, verified Supabase product-image URLs in the
 * database with their R2 equivalents. This never deletes Storage objects.
 * Run without --apply for a read-only pre-cutover check.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const ARTIFACT_DIRECTORY = resolve(PROJECT_ROOT, 'artifacts/r2-product-image-copy');
const MAPPING_PATH = resolve(ARTIFACT_DIRECTORY, 'referenced-image-url-mapping.json');
const BACKUP_PATH = resolve(ARTIFACT_DIRECTORY, 'pre-phase-2a-supabase-image-state.json');
const EXPECTED_PRODUCT_REFERENCES = 84;
const EXPECTED_VARIANT_REFERENCES = 26;
const EXPECTED_UNIQUE_REFERENCES = 110;
const APPLY = process.argv.includes('--apply');
const REQUEST_CONCURRENCY = 8;

function parseDotEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

async function loadLocalEnvironment() {
  try {
    const values = parseDotEnv(await readFile(resolve(PROJECT_ROOT, '.env.local'), 'utf8'));
    for (const [key, value] of Object.entries(values)) if (!process.env[key]) process.env[key] = value;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function imageUrls(row) {
  return Array.isArray(row.image_urls) ? row.image_urls.filter((url) => typeof url === 'string' && url.trim()) : [];
}

function variantImageUrls(rows) {
  return rows.map((row) => row.image_url).filter((url) => typeof url === 'string' && url.trim());
}

function summary(products, variants) {
  const productUrls = products.flatMap(imageUrls);
  const variantUrls = variantImageUrls(variants);
  return {
    productUrls,
    variantUrls,
    allUrls: [...productUrls, ...variantUrls],
    uniqueUrls: [...new Set([...productUrls, ...variantUrls])],
  };
}

async function fetchDatabaseState(supabase) {
  const [{ data: products, error: productError }, { data: variants, error: variantError }] = await Promise.all([
    supabase.from('products').select('id, image_urls').order('id'),
    supabase.from('product_variants').select('id, product_id, image_url').order('id'),
  ]);
  if (productError) throw new Error(`Could not read products.image_urls: ${productError.message}`);
  if (variantError) throw new Error(`Could not read product_variants.image_url: ${variantError.message}`);
  return { products: products ?? [], variants: variants ?? [] };
}

async function readMapping() {
  const artifact = JSON.parse(await readFile(MAPPING_PATH, 'utf8'));
  if (!Array.isArray(artifact.mappings)) throw new Error('Phase 1 mapping artifact has no mappings array');
  if (artifact.uniqueReferencedImages !== EXPECTED_UNIQUE_REFERENCES || artifact.mappings.length !== EXPECTED_UNIQUE_REFERENCES) {
    throw new Error(`Phase 1 mapping artifact must contain exactly ${EXPECTED_UNIQUE_REFERENCES} mappings`);
  }

  const mapping = new Map();
  for (const row of artifact.mappings) {
    if (!row?.sourceUrl || !row?.destinationPublicUrl || row.status !== 'copied-and-verified') {
      throw new Error('Phase 1 mapping artifact contains an incomplete or unverified row');
    }
    if (mapping.has(row.sourceUrl)) throw new Error(`Phase 1 mapping artifact contains duplicate source URL: ${row.sourceUrl}`);
    mapping.set(row.sourceUrl, row.destinationPublicUrl);
  }
  return mapping;
}

function assertExpectedPreCutoverState(state, mapping) {
  const counts = summary(state.products, state.variants);
  if (counts.productUrls.length !== EXPECTED_PRODUCT_REFERENCES) throw new Error(`Expected ${EXPECTED_PRODUCT_REFERENCES} product image references, found ${counts.productUrls.length}`);
  if (counts.variantUrls.length !== EXPECTED_VARIANT_REFERENCES) throw new Error(`Expected ${EXPECTED_VARIANT_REFERENCES} variant image references, found ${counts.variantUrls.length}`);
  if (counts.uniqueUrls.length !== EXPECTED_UNIQUE_REFERENCES) throw new Error(`Expected ${EXPECTED_UNIQUE_REFERENCES} unique image references, found ${counts.uniqueUrls.length}`);

  const destinationUrls = new Set(mapping.values());
  const unmapped = counts.uniqueUrls.filter((url) => !mapping.has(url) && !destinationUrls.has(url));
  if (unmapped.length > 0) throw new Error(`Found ${unmapped.length} unexpected or unmapped current image URL(s)`);
  return {
    ...counts,
    supabaseReferenceCount: counts.allUrls.filter((url) => mapping.has(url)).length,
    r2ReferenceCount: counts.allUrls.filter((url) => destinationUrls.has(url)).length,
  };
}

async function readExistingBackup() {
  try {
    return JSON.parse(await readFile(BACKUP_PATH, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function ensurePreSwitchBackup(state) {
  const existingBackup = await readExistingBackup();
  if (existingBackup) return { backup: existingBackup, created: false };

  const backup = {
    phase: 'Phase 2A pre-switch rollback backup',
    createdAt: new Date().toISOString(),
    products: state.products.map((row) => ({ id: row.id, image_urls: row.image_urls })),
    variants: state.variants.map((row) => ({ id: row.id, product_id: row.product_id, image_url: row.image_url })),
  };
  await mkdir(ARTIFACT_DIRECTORY, { recursive: true });
  await writeFile(BACKUP_PATH, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');
  return { backup, created: true };
}

function updatedState(state, mapping) {
  const products = state.products.map((row) => {
    const original = Array.isArray(row.image_urls) ? row.image_urls : [];
    const image_urls = original.map((url) => mapping.get(url) ?? url);
    return { id: row.id, previousImageUrls: original, image_urls, changed: JSON.stringify(original) !== JSON.stringify(image_urls) };
  });
  const variants = state.variants.map((row) => {
    const image_url = row.image_url ? mapping.get(row.image_url) ?? row.image_url : row.image_url;
    return { id: row.id, previousImageUrl: row.image_url, image_url, changed: image_url !== row.image_url };
  });
  return { products, variants };
}

async function updateDatabase(supabase, planned) {
  for (const row of planned.products.filter((entry) => entry.changed)) {
    const { error } = await supabase.from('products').update({ image_urls: row.image_urls }).eq('id', row.id);
    if (error) throw new Error(`Could not update products ${row.id}: ${error.message}`);
  }
  for (const row of planned.variants.filter((entry) => entry.changed)) {
    const { error } = await supabase.from('product_variants').update({ image_url: row.image_url }).eq('id', row.id);
    if (error) throw new Error(`Could not update product_variants ${row.id}: ${error.message}`);
  }
}

async function restoreDatabase(supabase, backup) {
  const errors = [];
  for (const row of backup.products ?? []) {
    const { error } = await supabase.from('products').update({ image_urls: row.image_urls }).eq('id', row.id);
    if (error) errors.push(`products ${row.id}: ${error.message}`);
  }
  for (const row of backup.variants ?? []) {
    const { error } = await supabase.from('product_variants').update({ image_url: row.image_url }).eq('id', row.id);
    if (error) errors.push(`product_variants ${row.id}: ${error.message}`);
  }
  if (errors.length > 0) throw new Error(`Rollback failed for ${errors.length} row(s): ${errors.join('; ')}`);
}

async function mapWithConcurrency(items, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      results[current] = await worker(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(REQUEST_CONCURRENCY, items.length) }, run));
  return results;
}

async function verifyPublicUrls(urls) {
  const results = await mapWithConcurrency(urls, async (url) => {
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}phase2a=${sha256(url)}`, { cache: 'no-store' });
      if (!response.ok) return { url, error: `HTTP ${response.status}` };
      await response.arrayBuffer();
      return { url, error: null };
    } catch (error) {
      return { url, error: error instanceof Error ? error.message : String(error) };
    }
  });
  return results.filter((result) => result.error);
}

function assertPostCutoverState(state, mapping, planned) {
  const counts = summary(state.products, state.variants);
  if (counts.productUrls.length !== EXPECTED_PRODUCT_REFERENCES) throw new Error(`Post-switch product reference count changed to ${counts.productUrls.length}`);
  if (counts.variantUrls.length !== EXPECTED_VARIANT_REFERENCES) throw new Error(`Post-switch variant reference count changed to ${counts.variantUrls.length}`);
  if (counts.uniqueUrls.length !== EXPECTED_UNIQUE_REFERENCES) throw new Error(`Post-switch unique reference count changed to ${counts.uniqueUrls.length}`);

  const destinationUrls = new Set(mapping.values());
  const nonR2 = counts.uniqueUrls.filter((url) => !destinationUrls.has(url));
  if (nonR2.length > 0) throw new Error(`Post-switch contains ${nonR2.length} non-R2 image URL(s)`);

  const actualProductRows = new Map(state.products.map((row) => [row.id, row.image_urls]));
  for (const row of planned.products) {
    const actual = actualProductRows.get(row.id) ?? [];
    if (JSON.stringify(actual) !== JSON.stringify(row.image_urls)) throw new Error(`Product image ordering changed or update did not persist for ${row.id}`);
  }
  const actualVariantRows = new Map(state.variants.map((row) => [row.id, row.image_url]));
  for (const row of planned.variants) {
    if ((actualVariantRows.get(row.id) ?? null) !== (row.image_url ?? null)) throw new Error(`Variant image update did not persist for ${row.id}`);
  }
  return counts;
}

async function main() {
  await loadLocalEnvironment();
  const supabase = createClient(requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL'), requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const mapping = await readMapping();
  const before = await fetchDatabaseState(supabase);
  const preCounts = assertExpectedPreCutoverState(before, mapping);
  const { backup, created: backupCreated } = await ensurePreSwitchBackup(before);
  const planned = updatedState(before, mapping);
  const productUrlsToSwitch = planned.products.reduce((total, row) => total + row.image_urls.filter((url, index) => url !== row.previousImageUrls[index]).length, 0);
  const variantUrlsToSwitch = planned.variants.filter((row) => row.changed).length;

  console.log('Phase 2A pre-cutover check passed');
  console.log(`Product URL references: ${preCounts.productUrls.length}`);
  console.log(`Variant URL references: ${preCounts.variantUrls.length}`);
  console.log(`Unique image references: ${preCounts.uniqueUrls.length}`);
  console.log(`Current Supabase image references: ${preCounts.supabaseReferenceCount}`);
  console.log(`Current R2 image references: ${preCounts.r2ReferenceCount}`);
  console.log(`Product URLs to switch: ${productUrlsToSwitch}`);
  console.log(`Variant URLs to switch: ${variantUrlsToSwitch}`);
  console.log(`Rollback backup: ${BACKUP_PATH} (${backupCreated ? 'created' : 'preserved'})`);

  if (!APPLY) {
    console.log('Read-only mode complete. Run again with --apply to switch the database URLs.');
    return;
  }

  try {
    await updateDatabase(supabase, planned);
    const after = await fetchDatabaseState(supabase);
    const postCounts = assertPostCutoverState(after, mapping, planned);
    const publicFailures = await verifyPublicUrls(postCounts.uniqueUrls);
    if (publicFailures.length > 0) throw new Error(`Post-switch R2 public verification failed for ${publicFailures.length} URL(s)`);

    console.log('Phase 2A cutover verified');
    console.log(`R2 references: ${postCounts.uniqueUrls.length}`);
    console.log('Remaining referenced Supabase product-image URLs: 0');
    console.log('Unmapped URLs: 0');
  } catch (error) {
    console.error(`Phase 2A failed; restoring pre-switch image state from ${BACKUP_PATH}`);
    try {
      await restoreDatabase(supabase, backup);
      console.error('Rollback completed successfully.');
    } catch (rollbackError) {
      console.error(`Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(`Phase 2A did not complete: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
