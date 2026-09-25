import { readFileSync, writeFileSync } from 'node:fs'
const config = JSON.parse(readFileSync(new URL('../config/cod.json', import.meta.url)))
if (config.ratePercent !== 2 || config.rounding !== 'ceil-peso') throw new Error('Review migration before changing fee policy.')
const sql = `-- Generated from config/cod.json by scripts/generate-cod-migration.mjs.
-- Change only the current function's new-order fee expression; existing orders are untouched.
do $migration$
declare
  definition text := pg_get_functiondef('public.create_guest_order(jsonb)'::regprocedure);
  previous text := 'cod_fee := ceil((subtotal-discount)*.01)';
  replacement text := 'cod_fee := ceil((subtotal-discount)*${config.ratePercent}/100)';
begin
  if position(replacement in definition) > 0 then return; end if;
  if position(previous in definition) = 0 then
    raise exception 'COD calculation changed: inspect create_guest_order before applying migration';
  end if;
  execute replace(definition, previous, replacement);
end;
$migration$;
`
const target = new URL('../supabase/migrations/20260922045754_cod_service_fee_two_percent.sql', import.meta.url)
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== sql) throw new Error('COD migration differs from authoritative config; regenerate it.')
} else writeFileSync(target, sql)
