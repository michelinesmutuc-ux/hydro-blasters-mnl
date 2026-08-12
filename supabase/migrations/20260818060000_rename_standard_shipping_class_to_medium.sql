-- Replace the old Standard shipping class with Medium without changing
-- historical order totals. New orders use Compact / Medium / Bulky only.

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~ 'shipping_class.*(Compact|Standard|Medium|Bulky)'
  loop
    execute format('alter table public.products drop constraint %I', constraint_name);
  end loop;
end $$;

update public.products
set shipping_class = 'Medium'
where shipping_class = 'Standard';

alter table public.products alter column shipping_class set default 'Bulky';
alter table public.products alter column shipping_class set not null;
alter table public.products
  add constraint products_shipping_class_check
  check (shipping_class in ('Compact', 'Medium', 'Bulky'));

-- Keep Standard only as a legacy order snapshot value. Existing orders are not
-- rewritten because their saved fee represents what the customer was charged.
alter table public.orders drop constraint if exists orders_shipping_tier_check;
alter table public.orders add constraint orders_shipping_tier_check
  check (shipping_tier in ('Compact', 'Medium', 'Bulky', 'On-Demand', 'Standard'));

create or replace function public.create_guest_order(payload jsonb)
returns table(order_id uuid, order_reference text, merchandise_subtotal numeric, shipping_fee numeric, cod_service_fee numeric, upfront_amount numeric, rider_collectible_amount numeric, showroom_payable_amount numeric, overall_total numeric, promo_name text, promo_discount numeric, promo_eligible_subtotal numeric, promo_redemption_number integer)
language plpgsql security definer set search_path = public as $$
declare
  item jsonb; product_row public.products%rowtype; variant_row public.product_variants%rowtype; existing_order public.orders%rowtype; promo_row public.launch_promo%rowtype; promo_reservation public.launch_promo_reservations%rowtype;
  item_price numeric; item_quantity integer; subtotal numeric := 0; eligible_subtotal numeric := 0; discount numeric := 0; shipping numeric := 0; cod_fee numeric := 0; upfront numeric := 0; rider numeric := 0; showroom numeric := 0; total numeric := 0; shipping_units integer := 0; shipping_tier_value text := 'Bulky'; new_id uuid; ref text;
  given_name text := trim(coalesce(payload->>'first_name', '')); surname text := trim(coalesce(payload->>'last_name', '')); combined_name text; claimed_number integer := null; checkout_session uuid := nullif(payload->>'checkout_session_id','')::uuid;
begin
  if jsonb_array_length(coalesce(payload->'items', '[]'::jsonb)) = 0 then raise exception 'Your cart is empty.'; end if;
  if given_name = '' or surname = '' or coalesce(payload->>'mobile_number', '') = '' then raise exception 'First name, last name, and mobile number are required.'; end if;
  combined_name := concat_ws(' ', given_name, surname);
  select * into existing_order from public.orders where idempotency_key = (payload->>'idempotency_key')::uuid;
  if found then
    return query select existing_order.id,existing_order.order_reference,existing_order.merchandise_subtotal,existing_order.shipping_fee,existing_order.cod_service_fee,existing_order.upfront_amount,existing_order.rider_collectible_amount,existing_order.showroom_payable_amount,existing_order.overall_total,existing_order.promo_name,existing_order.promo_discount,existing_order.promo_eligible_subtotal,existing_order.promo_redemption_number;
    return;
  end if;
  if payload->>'delivery_method' = 'nationwide_delivery' and (coalesce(payload->>'house_unit','') = '' or coalesce(payload->>'street','') = '' or coalesce(payload->>'barangay','') = '' or coalesce(payload->>'city_municipality','') = '' or coalesce(payload->>'region','') = '' or coalesce(payload->>'postal_code','') = '') then raise exception 'Complete delivery address is required.'; end if;

  for item in select * from jsonb_array_elements(payload->'items') loop
    item_quantity := (item->>'quantity')::integer;
    if item_quantity is null or item_quantity < 1 then raise exception 'Each item must have a valid quantity.'; end if;
    select * into product_row from public.products where id = (item->>'product_id')::uuid and is_active = true for update;
    if not found then raise exception 'A product is no longer available.'; end if;
    if coalesce(product_row.has_variants,false) then
      if coalesce(item->>'variant_id','') = '' then raise exception 'Choose a % for %.',coalesce(product_row.variant_group_name,'variant'),product_row.name; end if;
      select * into variant_row from public.product_variants where id = (item->>'variant_id')::uuid and product_id = product_row.id for update;
      if not found then raise exception 'The selected variant is no longer available.'; end if;
      if item_quantity > variant_row.stock then raise exception 'Insufficient stock for % — %.',product_row.name,variant_row.name; end if;
      item_price := variant_row.price;
    else
      if item_quantity > product_row.stock then raise exception 'Insufficient stock for %.',product_row.name; end if;
      item_price := product_row.price;
    end if;
    subtotal := subtotal + item_price * item_quantity;
    if not product_row.is_clearance then eligible_subtotal := eligible_subtotal + item_price * item_quantity; end if;
    shipping_units := shipping_units + (case product_row.shipping_class when 'Compact' then 1 when 'Medium' then 3 else 9 end) * item_quantity;
  end loop;

  if eligible_subtotal > 0 and checkout_session is not null then
    select * into promo_reservation from public.launch_promo_reservations where checkout_session_id = checkout_session for update;
    if found and promo_reservation.status = 'reserved' and promo_reservation.expires_at > now() then
      select * into promo_row from public.launch_promo where id = true for update;
      if not found or not promo_row.active or promo_row.claimed_redemptions >= 7 then raise exception 'Your Launch Promo reservation could not be honoured. Check promo availability before placing your order.'; end if;
      discount := least(round(eligible_subtotal * promo_row.discount_percent, 2), promo_row.maximum_discount, eligible_subtotal);
      claimed_number := promo_row.claimed_redemptions + 1;
      update public.launch_promo set claimed_redemptions = claimed_number, updated_at = now() where id = true;
    elsif found and promo_reservation.status = 'reserved' then
      update public.launch_promo_reservations set status = 'expired', updated_at = now() where id = promo_reservation.id;
      raise exception 'Your Launch Promo reservation expired. Check promo availability before placing your order.';
    end if;
  end if;

  if shipping_units <= 2 then shipping_tier_value := 'Compact'; shipping := 99; elsif shipping_units <= 8 then shipping_tier_value := 'Medium'; shipping := 179; else shipping_tier_value := 'Bulky'; shipping := 249; end if;
  if payload->>'delivery_method' <> 'nationwide_delivery' then shipping := 0; end if;
  if payload->>'payment_method' = 'cash_on_delivery' then cod_fee := ceil((subtotal-discount)*.01); upfront := shipping+cod_fee; rider := subtotal-discount; total := rider+shipping+cod_fee;
  elsif payload->>'payment_method' = 'pay_upon_pickup' then showroom := subtotal-discount; total := showroom;
  else upfront := subtotal-discount+shipping; total := upfront; end if;

  ref := 'HBMNL-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.orders(order_reference,idempotency_key,customer_name,first_name,last_name,mobile_number,house_unit,street,barangay,city_municipality,region,postal_code,order_notes,delivery_method,payment_method,selected_payment_option_name,merchandise_subtotal,shipping_fee,cod_service_fee,upfront_amount,rider_collectible_amount,showroom_payable_amount,overall_total,shipping_classification,shipping_tier,payment_status,order_status,reservation_deadline,promo_name,promo_discount,promo_eligible_subtotal,promo_redemption_number)
  values(ref,(payload->>'idempotency_key')::uuid,combined_name,given_name,surname,payload->>'mobile_number',payload->>'house_unit',payload->>'street',payload->>'barangay',payload->>'city_municipality',payload->>'region',payload->>'postal_code',nullif(payload->>'order_notes',''),payload->>'delivery_method',payload->>'payment_method',nullif(payload->>'payment_option_name',''),subtotal,shipping,cod_fee,upfront,rider,showroom,total,lower(shipping_tier_value),shipping_tier_value,'pending_verification',case when payload->>'payment_method'='pay_upon_pickup' then 'reservation_pending' else 'pending' end,case when payload->>'payment_method'='pay_upon_pickup' then now()+interval '24 hours' else null end,case when discount>0 then promo_row.name else null end,discount,eligible_subtotal,claimed_number) returning id into new_id;

  if discount > 0 then
    update public.launch_promo_reservations
    set status = 'claimed', claimed_at = now(), order_id = new_id, discount_amount = discount,
        claim_kind = case when claimed_number > 5 then 'buffer' else 'primary' end, updated_at = now()
    where id = promo_reservation.id;
  end if;
  for item in select * from jsonb_array_elements(payload->'items') loop
    item_quantity := (item->>'quantity')::integer;
    select * into product_row from public.products where id=(item->>'product_id')::uuid;
    if product_row.has_variants then select * into variant_row from public.product_variants where id=(item->>'variant_id')::uuid and product_id=product_row.id; item_price:=variant_row.price; else item_price:=product_row.price; end if;
    insert into public.order_items(order_id,product_id,product_name,variant_id,variant_group_name,variant_name,price_snapshot,quantity,line_total,is_clearance)
    values(new_id,product_row.id,product_row.name,case when product_row.has_variants then variant_row.id else null end,case when product_row.has_variants then product_row.variant_group_name else null end,case when product_row.has_variants then variant_row.name else null end,item_price,item_quantity,item_price*item_quantity,product_row.is_clearance);
  end loop;
  return query select new_id,ref,subtotal,shipping,cod_fee,upfront,rider,showroom,total,case when discount>0 then promo_row.name else null end,discount,eligible_subtotal,claimed_number;
end;
$$;

revoke all on function public.create_guest_order(jsonb) from public;
grant execute on function public.create_guest_order(jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
