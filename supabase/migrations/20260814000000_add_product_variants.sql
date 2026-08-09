alter table public.products
  add column if not exists has_variants boolean not null default false,
  add column if not exists variant_group_name text;

alter table public.products drop constraint if exists products_variant_group_name_check;
alter table public.products add constraint products_variant_group_name_check
  check ((has_variants = false and variant_group_name is null) or (has_variants = true and length(trim(coalesce(variant_group_name, ''))) > 0));

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  price numeric(10,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  sku text,
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists product_variants_product_name_unique on public.product_variants(product_id, lower(name));
create index if not exists product_variants_product_sort_idx on public.product_variants(product_id, sort_order);
create or replace function public.set_product_variants_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists product_variants_set_updated_at on public.product_variants;
create trigger product_variants_set_updated_at
before update on public.product_variants
for each row execute function public.set_product_variants_updated_at();
alter table public.product_variants enable row level security;
drop policy if exists "Admins manage product variants" on public.product_variants;
create policy "Admins manage product variants" on public.product_variants for all to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "Public reads active product variants" on public.product_variants;
create policy "Public reads active product variants" on public.product_variants for select to anon, authenticated using (exists (select 1 from public.products p where p.id = product_variants.product_id and p.is_active = true));

alter table public.order_items
  add column if not exists variant_id uuid,
  add column if not exists variant_group_name text,
  add column if not exists variant_name text;

create or replace function public.create_guest_order(payload jsonb)
returns table(order_id uuid, order_reference text, merchandise_subtotal numeric, shipping_fee numeric, cod_service_fee numeric, upfront_amount numeric, rider_collectible_amount numeric, showroom_payable_amount numeric, overall_total numeric)
language plpgsql security definer set search_path = public as $$
declare
  item jsonb; product_row public.products%rowtype; variant_row public.product_variants%rowtype; existing_order public.orders%rowtype;
  item_price numeric; subtotal numeric := 0; shipping numeric := 0; cod_fee numeric := 0; upfront numeric := 0; rider numeric := 0; showroom numeric := 0; total numeric := 0; has_bulky boolean := false; new_id uuid; ref text;
  given_name text := trim(coalesce(payload->>'first_name', '')); surname text := trim(coalesce(payload->>'last_name', '')); combined_name text;
begin
  if jsonb_array_length(coalesce(payload->'items', '[]'::jsonb)) = 0 then raise exception 'Your cart is empty.'; end if;
  if given_name = '' or surname = '' or coalesce(payload->>'mobile_number', '') = '' then raise exception 'First name, last name, and mobile number are required.'; end if;
  combined_name := concat_ws(' ', given_name, surname);
  select * into existing_order from public.orders where idempotency_key = (payload->>'idempotency_key')::uuid;
  if found then return query select existing_order.id, existing_order.order_reference, existing_order.merchandise_subtotal, existing_order.shipping_fee, existing_order.cod_service_fee, existing_order.upfront_amount, existing_order.rider_collectible_amount, existing_order.showroom_payable_amount, existing_order.overall_total; return; end if;
  if payload->>'delivery_method' = 'nationwide_delivery' and (coalesce(payload->>'house_unit', '') = '' or coalesce(payload->>'street', '') = '' or coalesce(payload->>'barangay', '') = '' or coalesce(payload->>'city_municipality', '') = '' or coalesce(payload->>'region', '') = '' or coalesce(payload->>'postal_code', '') = '') then raise exception 'Complete delivery address is required.'; end if;
  for item in select * from jsonb_array_elements(payload->'items') loop
    select * into product_row from public.products where id = (item->>'product_id')::uuid and is_active = true for update;
    if not found then raise exception 'A product is no longer available.'; end if;
    if coalesce(product_row.has_variants, false) then
      if coalesce(item->>'variant_id', '') = '' then raise exception 'Choose a % for %.', coalesce(product_row.variant_group_name, 'variant'), product_row.name; end if;
      select * into variant_row from public.product_variants where id = (item->>'variant_id')::uuid and product_id = product_row.id for update;
      if not found then raise exception 'The selected variant is no longer available.'; end if;
      if (item->>'quantity')::integer > variant_row.stock then raise exception 'Insufficient stock for % — %.', product_row.name, variant_row.name; end if;
      item_price := variant_row.price;
    else
      if (item->>'quantity')::integer > product_row.stock then raise exception 'Insufficient stock for %.', product_row.name; end if;
      item_price := product_row.price;
    end if;
    subtotal := subtotal + item_price * (item->>'quantity')::integer;
    has_bulky := has_bulky or product_row.shipping_classification = 'bulky';
  end loop;
  if payload->>'delivery_method' = 'nationwide_delivery' then shipping := case when has_bulky then 199 else 149 end; end if;
  if payload->>'payment_method' = 'cash_on_delivery' then cod_fee := ceil(subtotal * .01); upfront := shipping + cod_fee; rider := subtotal; total := subtotal + shipping + cod_fee;
  elsif payload->>'payment_method' = 'pay_upon_pickup' then showroom := subtotal; total := subtotal;
  else upfront := subtotal + shipping; total := upfront; end if;
  ref := 'HBMNL-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.orders(order_reference,idempotency_key,customer_name,first_name,last_name,mobile_number,house_unit,street,barangay,city_municipality,region,postal_code,order_notes,delivery_method,payment_method,selected_payment_option_name,merchandise_subtotal,shipping_fee,cod_service_fee,upfront_amount,rider_collectible_amount,showroom_payable_amount,overall_total,shipping_classification,payment_status,order_status,reservation_deadline)
  values(ref,(payload->>'idempotency_key')::uuid,combined_name,given_name,surname,payload->>'mobile_number',payload->>'house_unit',payload->>'street',payload->>'barangay',payload->>'city_municipality',payload->>'region',payload->>'postal_code',nullif(payload->>'order_notes',''),payload->>'delivery_method',payload->>'payment_method',nullif(payload->>'payment_option_name',''),subtotal,shipping,cod_fee,upfront,rider,showroom,total,case when has_bulky then 'bulky' else 'standard' end,'pending_verification',case when payload->>'payment_method' = 'pay_upon_pickup' then 'reservation_pending' else 'pending' end,case when payload->>'payment_method' = 'pay_upon_pickup' then now() + interval '24 hours' else null end) returning id into new_id;
  for item in select * from jsonb_array_elements(payload->'items') loop
    select * into product_row from public.products where id = (item->>'product_id')::uuid;
    if product_row.has_variants then select * into variant_row from public.product_variants where id = (item->>'variant_id')::uuid and product_id = product_row.id; item_price := variant_row.price; else item_price := product_row.price; end if;
    insert into public.order_items(order_id,product_id,product_name,variant_id,variant_group_name,variant_name,price_snapshot,quantity,line_total)
    values(new_id,product_row.id,product_row.name,case when product_row.has_variants then variant_row.id else null end,case when product_row.has_variants then product_row.variant_group_name else null end,case when product_row.has_variants then variant_row.name else null end,item_price,(item->>'quantity')::integer,item_price*(item->>'quantity')::integer);
  end loop;
  return query select new_id,ref,subtotal,shipping,cod_fee,upfront,rider,showroom,total;
end $$;

revoke all on function public.create_guest_order(jsonb) from public;
grant execute on function public.create_guest_order(jsonb) to anon, authenticated;
