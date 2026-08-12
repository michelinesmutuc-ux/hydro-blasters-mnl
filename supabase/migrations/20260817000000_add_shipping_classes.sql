-- Three-tier shipping classes. Existing products deliberately start as Bulky.
alter table public.products add column if not exists shipping_class text;
update public.products set shipping_class = 'Bulky' where shipping_class is null or shipping_class not in ('Compact', 'Standard', 'Bulky');
alter table public.products alter column shipping_class set default 'Bulky';
alter table public.products alter column shipping_class set not null;
alter table public.products drop constraint if exists products_shipping_class_check;
alter table public.products add constraint products_shipping_class_check check (shipping_class in ('Compact', 'Standard', 'Bulky'));

alter table public.orders add column if not exists shipping_tier text;
update public.orders set shipping_tier = case when shipping_fee <= 99 then 'Compact' when shipping_fee <= 149 then 'Standard' else 'Bulky' end where shipping_tier is null;
alter table public.orders alter column shipping_tier set default 'Bulky';
alter table public.orders alter column shipping_tier set not null;
alter table public.orders drop constraint if exists orders_shipping_tier_check;
alter table public.orders add constraint orders_shipping_tier_check check (shipping_tier in ('Compact', 'Standard', 'Bulky'));

create table if not exists public.launch_promo_reservations (
  id uuid primary key default gen_random_uuid(),
  checkout_session_id uuid not null unique,
  status text not null default 'reserved' check (status in ('reserved','claimed','expired')),
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  order_id uuid references public.orders(id),
  eligible_subtotal numeric(10,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,
  claim_kind text not null default 'primary' check (claim_kind in ('primary','buffer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.launch_promo_reservations enable row level security;

create or replace function public.reserve_launch_promo(checkout_session uuid, items jsonb)
returns table(status text, expires_at timestamptz, server_now timestamptz, eligible_subtotal numeric, discount_amount numeric)
language plpgsql security definer set search_path = public as $$
declare promo public.launch_promo%rowtype; existing public.launch_promo_reservations%rowtype; item jsonb; product public.products%rowtype; variant public.product_variants%rowtype; quantity integer; price numeric; eligible numeric := 0; active_reservations integer;
begin
  update public.launch_promo_reservations set status='expired',updated_at=now() where status='reserved' and expires_at <= now();
  select * into existing from public.launch_promo_reservations where checkout_session_id=checkout_session for update;
  if found and existing.status='reserved' and existing.expires_at > now() then return query select 'reserved',existing.expires_at,now(),existing.eligible_subtotal,existing.discount_amount; return; end if;
  if jsonb_array_length(coalesce(items,'[]'::jsonb))=0 then return query select 'unavailable',null::timestamptz,now(),0::numeric,0::numeric; return; end if;
  for item in select * from jsonb_array_elements(items) loop
    quantity := greatest(0,coalesce((item->>'quantity')::integer,0));
    select * into product from public.products where id=(item->>'product_id')::uuid and is_active=true;
    if not found then raise exception 'A product is no longer available.'; end if;
    if product.has_variants then select * into variant from public.product_variants where id=(item->>'variant_id')::uuid and product_id=product.id; if not found then raise exception 'The selected variant is no longer available.'; end if; price:=variant.price; else price:=product.price; end if;
    if not product.is_clearance then eligible:=eligible+price*quantity; end if;
  end loop;
  if eligible<=0 then return query select 'unavailable',null::timestamptz,now(),eligible,0::numeric; return; end if;
  select * into promo from public.launch_promo where id=true for update;
  select count(*) into active_reservations from public.launch_promo_reservations where status='reserved' and expires_at>now();
  if not found or not promo.active or promo.claimed_redemptions + active_reservations >= 5 then return query select 'unavailable',null::timestamptz,now(),eligible,0::numeric; return; end if;
  insert into public.launch_promo_reservations(checkout_session_id,status,reserved_at,expires_at,eligible_subtotal,discount_amount) values(checkout_session,'reserved',now(),now()+interval '20 minutes',eligible,least(round(eligible*promo.discount_percent,2),promo.maximum_discount,eligible)) on conflict (checkout_session_id) do update set status='reserved',reserved_at=now(),expires_at=now()+interval '20 minutes',eligible_subtotal=excluded.eligible_subtotal,discount_amount=excluded.discount_amount,updated_at=now() returning * into existing;
  return query select 'reserved',existing.expires_at,now(),existing.eligible_subtotal,existing.discount_amount;
end $$;
revoke all on function public.reserve_launch_promo(uuid,jsonb) from public;
grant execute on function public.reserve_launch_promo(uuid,jsonb) to anon,authenticated;

create or replace function public.create_guest_order(payload jsonb)
returns table(order_id uuid, order_reference text, merchandise_subtotal numeric, shipping_fee numeric, cod_service_fee numeric, upfront_amount numeric, rider_collectible_amount numeric, showroom_payable_amount numeric, overall_total numeric, promo_name text, promo_discount numeric, promo_eligible_subtotal numeric, promo_redemption_number integer)
language plpgsql security definer set search_path = public as $$
declare
  item jsonb; product_row public.products%rowtype; variant_row public.product_variants%rowtype; existing_order public.orders%rowtype; promo_row public.launch_promo%rowtype; reservation public.launch_promo_reservations%rowtype;
  item_price numeric; item_quantity integer; subtotal numeric := 0; eligible_subtotal numeric := 0; discount numeric := 0; shipping numeric := 0; cod_fee numeric := 0; upfront numeric := 0; rider numeric := 0; showroom numeric := 0; total numeric := 0; shipping_units integer := 0; shipping_tier_value text := 'Bulky'; new_id uuid; ref text;
  given_name text := trim(coalesce(payload->>'first_name', '')); surname text := trim(coalesce(payload->>'last_name', '')); combined_name text; claimed_number integer := null; checkout_session uuid := nullif(payload->>'checkout_session_id','')::uuid;
begin
  if jsonb_array_length(coalesce(payload->'items', '[]'::jsonb)) = 0 then raise exception 'Your cart is empty.'; end if;
  if given_name = '' or surname = '' or coalesce(payload->>'mobile_number', '') = '' then raise exception 'First name, last name, and mobile number are required.'; end if;
  combined_name := concat_ws(' ', given_name, surname);
  select * into existing_order from public.orders where idempotency_key = (payload->>'idempotency_key')::uuid;
  if found then return query select existing_order.id,existing_order.order_reference,existing_order.merchandise_subtotal,existing_order.shipping_fee,existing_order.cod_service_fee,existing_order.upfront_amount,existing_order.rider_collectible_amount,existing_order.showroom_payable_amount,existing_order.overall_total,existing_order.promo_name,existing_order.promo_discount,existing_order.promo_eligible_subtotal,existing_order.promo_redemption_number; return; end if;
  if payload->>'delivery_method' = 'nationwide_delivery' and (coalesce(payload->>'house_unit','') = '' or coalesce(payload->>'street','') = '' or coalesce(payload->>'barangay','') = '' or coalesce(payload->>'city_municipality','') = '' or coalesce(payload->>'region','') = '' or coalesce(payload->>'postal_code','') = '') then raise exception 'Complete delivery address is required.'; end if;
  for item in select * from jsonb_array_elements(payload->'items') loop
    item_quantity := (item->>'quantity')::integer; if item_quantity is null or item_quantity < 1 then raise exception 'Each item must have a valid quantity.'; end if;
    select * into product_row from public.products where id = (item->>'product_id')::uuid and is_active = true for update;
    if not found then raise exception 'A product is no longer available.'; end if;
    if coalesce(product_row.has_variants,false) then
      if coalesce(item->>'variant_id','') = '' then raise exception 'Choose a % for %.',coalesce(product_row.variant_group_name,'variant'),product_row.name; end if;
      select * into variant_row from public.product_variants where id = (item->>'variant_id')::uuid and product_id = product_row.id for update;
      if not found then raise exception 'The selected variant is no longer available.'; end if;
      if item_quantity > variant_row.stock then raise exception 'Insufficient stock for % — %.',product_row.name,variant_row.name; end if; item_price := variant_row.price;
    else
      if item_quantity > product_row.stock then raise exception 'Insufficient stock for %.',product_row.name; end if; item_price := product_row.price;
    end if;
    subtotal := subtotal + item_price * item_quantity;
    if not product_row.is_clearance then eligible_subtotal := eligible_subtotal + item_price * item_quantity; end if;
    shipping_units := shipping_units + (case product_row.shipping_class when 'Compact' then 1 when 'Standard' then 3 else 9 end) * item_quantity;
  end loop;
  if eligible_subtotal > 0 and checkout_session is not null then
    select * into reservation from public.launch_promo_reservations where checkout_session_id=checkout_session for update;
    if found and reservation.status='reserved' and reservation.expires_at>now() then
      select * into promo_row from public.launch_promo where id=true for update;
      if promo_row.active and promo_row.claimed_redemptions < 7 then
        discount:=least(round(eligible_subtotal*promo_row.discount_percent,2),promo_row.maximum_discount,eligible_subtotal);
        claimed_number:=promo_row.claimed_redemptions+1;
        update public.launch_promo set claimed_redemptions=claimed_number,updated_at=now() where id=true;
      end if;
    elsif found and reservation.status='reserved' then
      update public.launch_promo_reservations set status='expired',updated_at=now() where id=reservation.id;
      raise exception 'Your Launch Promo reservation expired. Check promo availability before placing your order.';
    end if;
  end if;
  if shipping_units <= 2 then shipping_tier_value := 'Compact'; shipping := 99; elsif shipping_units <= 8 then shipping_tier_value := 'Standard'; shipping := 149; else shipping_tier_value := 'Bulky'; shipping := 249; end if;
  if payload->>'delivery_method' <> 'nationwide_delivery' then shipping := 0; end if;
  if payload->>'payment_method' = 'cash_on_delivery' then cod_fee := ceil((subtotal-discount)*.01); upfront := shipping+cod_fee; rider := subtotal-discount; total := rider+shipping+cod_fee;
  elsif payload->>'payment_method' = 'pay_upon_pickup' then showroom := subtotal-discount; total := showroom;
  else upfront := subtotal-discount+shipping; total := upfront; end if;
  ref := 'HBMNL-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.orders(order_reference,idempotency_key,customer_name,first_name,last_name,mobile_number,house_unit,street,barangay,city_municipality,region,postal_code,order_notes,delivery_method,payment_method,selected_payment_option_name,merchandise_subtotal,shipping_fee,cod_service_fee,upfront_amount,rider_collectible_amount,showroom_payable_amount,overall_total,shipping_classification,shipping_tier,payment_status,order_status,reservation_deadline,promo_name,promo_discount,promo_eligible_subtotal,promo_redemption_number)
  values(ref,(payload->>'idempotency_key')::uuid,combined_name,given_name,surname,payload->>'mobile_number',payload->>'house_unit',payload->>'street',payload->>'barangay',payload->>'city_municipality',payload->>'region',payload->>'postal_code',nullif(payload->>'order_notes',''),payload->>'delivery_method',payload->>'payment_method',nullif(payload->>'payment_option_name',''),subtotal,shipping,cod_fee,upfront,rider,showroom,total,lower(shipping_tier_value),shipping_tier_value,'pending_verification',case when payload->>'payment_method'='pay_upon_pickup' then 'reservation_pending' else 'pending' end,case when payload->>'payment_method'='pay_upon_pickup' then now()+interval '24 hours' else null end,case when discount>0 then promo_row.name else null end,discount,eligible_subtotal,claimed_number) returning id into new_id;
  if discount>0 then update public.launch_promo_reservations set status='claimed',claimed_at=now(),order_id=new_id,eligible_subtotal=eligible_subtotal,discount_amount=discount,updated_at=now() where id=reservation.id; end if;
  for item in select * from jsonb_array_elements(payload->'items') loop
    item_quantity := (item->>'quantity')::integer; select * into product_row from public.products where id=(item->>'product_id')::uuid;
    if product_row.has_variants then select * into variant_row from public.product_variants where id=(item->>'variant_id')::uuid and product_id=product_row.id; item_price:=variant_row.price; else item_price:=product_row.price; end if;
    insert into public.order_items(order_id,product_id,product_name,variant_id,variant_group_name,variant_name,price_snapshot,quantity,line_total,is_clearance) values(new_id,product_row.id,product_row.name,case when product_row.has_variants then variant_row.id else null end,case when product_row.has_variants then product_row.variant_group_name else null end,case when product_row.has_variants then variant_row.name else null end,item_price,item_quantity,item_price*item_quantity,product_row.is_clearance);
  end loop;
  return query select new_id,ref,subtotal,shipping,cod_fee,upfront,rider,showroom,total,case when discount>0 then promo_row.name else null end,discount,eligible_subtotal,claimed_number;
end $$;
revoke all on function public.create_guest_order(jsonb) from public;
grant execute on function public.create_guest_order(jsonb) to anon, authenticated;
