-- Generated from config/cod.json by scripts/generate-cod-migration.mjs.
-- Change only the current function's new-order fee expression; existing orders are untouched.
do $migration$
declare
  definition text := pg_get_functiondef('public.create_guest_order(jsonb)'::regprocedure);
  previous text := 'cod_fee := ceil((subtotal-discount)*.01)';
  replacement text := 'cod_fee := ceil((subtotal-discount)*2/100)';
begin
  if position(replacement in definition) > 0 then return; end if;
  if position(previous in definition) = 0 then
    raise exception 'COD calculation changed: inspect create_guest_order before applying migration';
  end if;
  execute replace(definition, previous, replacement);
end;
$migration$;
