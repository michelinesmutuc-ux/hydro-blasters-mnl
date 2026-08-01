-- Keeps payment_settings as the parent payment-method table.
-- Bank Transfer can now have any number of separately managed options.
alter table public.payment_settings
  alter column masked_account_name drop not null,
  alter column masked_account_number drop not null,
  alter column qr_path drop not null;

create table if not exists public.payment_method_options (
  id uuid primary key default gen_random_uuid(),
  payment_method_id uuid not null references public.payment_settings(id) on delete cascade,
  name text not null,
  qr_path text not null,
  masked_account_name text not null,
  masked_account_number text not null,
  enabled boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_method_id, name)
);

create index if not exists payment_method_options_method_order_idx
  on public.payment_method_options(payment_method_id, sort_order, created_at);

alter table public.payment_method_options enable row level security;
drop policy if exists "Public reads enabled payment options" on public.payment_method_options;
drop policy if exists "Admins manage payment options" on public.payment_method_options;
create policy "Public reads enabled payment options"
  on public.payment_method_options for select to anon, authenticated
  using (
    enabled = true and exists (
      select 1 from public.payment_settings methods
      where methods.id = payment_method_options.payment_method_id
        and methods.method = 'bank_transfer'
        and methods.enabled = true
    )
  );
create policy "Admins manage payment options"
  on public.payment_method_options for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- QR files are private. Browser access is granted only while the linked setting
-- or bank option is enabled; old disabled QR URLs cannot be fetched publicly.
update storage.buckets set public = false where id = 'payment-qrs';
drop policy if exists "Public reads enabled payment QR images" on storage.objects;
create policy "Public reads enabled payment QR images"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'payment-qrs' and (
      exists (
        select 1 from public.payment_settings methods
        where methods.enabled = true and methods.qr_path = storage.objects.name
      ) or exists (
        select 1 from public.payment_method_options options
        join public.payment_settings methods on methods.id = options.payment_method_id
        where options.enabled = true
          and methods.enabled = true
          and options.qr_path = storage.objects.name
      )
    )
  );

alter table public.orders
  add column if not exists selected_payment_option_id uuid references public.payment_method_options(id) on delete set null,
  add column if not exists selected_payment_option_name text;

create or replace function public.create_guest_order(payload jsonb)
returns table(order_id uuid, order_reference text, merchandise_subtotal numeric, shipping_fee numeric, cod_service_fee numeric, upfront_amount numeric, rider_collectible_amount numeric, showroom_payable_amount numeric, overall_total numeric)
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  product_row public.products%rowtype;
  selected_option public.payment_method_options%rowtype;
  subtotal numeric := 0;
  shipping numeric := 0;
  cod_fee numeric := 0;
  upfront numeric := 0;
  rider numeric := 0;
  showroom numeric := 0;
  total numeric := 0;
  has_bulky boolean := false;
  new_id uuid;
  ref text;
begin
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb)) = 0 then raise exception 'Your cart is empty.'; end if;
  if coalesce(payload->>'customer_name','') = '' or coalesce(payload->>'mobile_number','') = '' then raise exception 'Full name and mobile number are required.'; end if;
  if payload->>'delivery_method' = 'nationwide_delivery' and (coalesce(payload->>'house_unit','')='' or coalesce(payload->>'street','')='' or coalesce(payload->>'barangay','')='' or coalesce(payload->>'city_municipality','')='' or coalesce(payload->>'region','')='' or coalesce(payload->>'postal_code','')='') then raise exception 'Complete delivery address is required.'; end if;
  if payload->>'payment_method' = 'bank_transfer' then
    if coalesce(payload->>'payment_option_id', '') = '' then raise exception 'Choose a bank before placing your order.'; end if;
    select options.* into selected_option
      from public.payment_method_options options
      join public.payment_settings methods on methods.id = options.payment_method_id
      where options.id = (payload->>'payment_option_id')::uuid
        and options.enabled = true
        and methods.method = 'bank_transfer'
        and methods.enabled = true;
    if not found then raise exception 'The selected bank transfer option is no longer available.'; end if;
  end if;
  for item in select * from jsonb_array_elements(payload->'items') loop
    select * into product_row from public.products where id = (item->>'product_id')::uuid and is_active = true for update;
    if not found then raise exception 'A product is no longer available.'; end if;
    if (item->>'quantity')::integer > product_row.stock then raise exception 'Insufficient stock for %.', product_row.name; end if;
    subtotal := subtotal + product_row.price * (item->>'quantity')::integer;
    has_bulky := has_bulky or product_row.shipping_classification = 'bulky';
  end loop;
  if payload->>'delivery_method' = 'nationwide_delivery' then shipping := case when has_bulky then 199 else 149 end; end if;
  if payload->>'payment_method' = 'cash_on_delivery' then cod_fee := ceil(subtotal * .01); upfront := shipping + cod_fee; rider := subtotal; total := subtotal + shipping + cod_fee;
  elsif payload->>'payment_method' = 'pay_upon_pickup' then showroom := subtotal; total := subtotal;
  else upfront := subtotal + shipping; total := upfront; end if;
  ref := 'HBMNL-' || to_char(now(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.orders(order_reference,idempotency_key,customer_name,mobile_number,house_unit,street,barangay,city_municipality,region,postal_code,order_notes,delivery_method,payment_method,selected_payment_option_id,selected_payment_option_name,merchandise_subtotal,shipping_fee,cod_service_fee,upfront_amount,rider_collectible_amount,showroom_payable_amount,overall_total,shipping_classification,payment_status,order_status,reservation_deadline)
  values(ref,(payload->>'idempotency_key')::uuid,payload->>'customer_name',payload->>'mobile_number',payload->>'house_unit',payload->>'street',payload->>'barangay',payload->>'city_municipality',payload->>'region',payload->>'postal_code',nullif(payload->>'order_notes',''),payload->>'delivery_method',payload->>'payment_method',case when payload->>'payment_method' = 'bank_transfer' then selected_option.id else null end,case when payload->>'payment_method' = 'bank_transfer' then selected_option.name else null end,subtotal,shipping,cod_fee,upfront,rider,showroom,total,case when has_bulky then 'bulky' else 'standard' end,'pending_verification',case when payload->>'payment_method'='pay_upon_pickup' then 'reservation_pending' else 'pending' end,case when payload->>'payment_method'='pay_upon_pickup' then now()+ interval '24 hours' else null end) returning id into new_id;
  for item in select * from jsonb_array_elements(payload->'items') loop
    select * into product_row from public.products where id=(item->>'product_id')::uuid;
    insert into public.order_items(order_id,product_id,product_name,price_snapshot,quantity,line_total) values(new_id,product_row.id,product_row.name,product_row.price,(item->>'quantity')::integer,product_row.price*(item->>'quantity')::integer);
  end loop;
  return query select new_id,ref,subtotal,shipping,cod_fee,upfront,rider,showroom,total;
end $$;
