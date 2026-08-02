alter table public.orders
  add column if not exists selected_payment_option_name text,
  add column if not exists telegram_notification_status text not null default 'pending',
  add column if not exists telegram_notification_sent_at timestamptz,
  add column if not exists telegram_notification_attempted_at timestamptz,
  add column if not exists telegram_notification_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_telegram_notification_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_telegram_notification_status_check
      check (telegram_notification_status in ('pending', 'sent', 'failed'));
  end if;
end $$;

create index if not exists orders_telegram_notification_status_idx
  on public.orders (telegram_notification_status, telegram_notification_attempted_at);

create or replace function public.create_guest_order(payload jsonb)
returns table(order_id uuid, order_reference text, merchandise_subtotal numeric, shipping_fee numeric, cod_service_fee numeric, upfront_amount numeric, rider_collectible_amount numeric, showroom_payable_amount numeric, overall_total numeric)
language plpgsql security definer set search_path = public as $$
declare item jsonb; product_row public.products%rowtype; existing_order public.orders%rowtype; subtotal numeric := 0; shipping numeric := 0; cod_fee numeric := 0; upfront numeric := 0; rider numeric := 0; showroom numeric := 0; total numeric := 0; has_bulky boolean := false; new_id uuid; ref text;
begin
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb)) = 0 then raise exception 'Your cart is empty.'; end if;
  if coalesce(payload->>'customer_name','') = '' or coalesce(payload->>'mobile_number','') = '' then raise exception 'Full name and mobile number are required.'; end if;
  select * into existing_order from public.orders where idempotency_key = (payload->>'idempotency_key')::uuid;
  if found then
    return query select existing_order.id,existing_order.order_reference,existing_order.merchandise_subtotal,existing_order.shipping_fee,existing_order.cod_service_fee,existing_order.upfront_amount,existing_order.rider_collectible_amount,existing_order.showroom_payable_amount,existing_order.overall_total;
    return;
  end if;
  if payload->>'delivery_method' = 'nationwide_delivery' and (coalesce(payload->>'house_unit','')='' or coalesce(payload->>'street','')='' or coalesce(payload->>'barangay','')='' or coalesce(payload->>'city_municipality','')='' or coalesce(payload->>'region','')='' or coalesce(payload->>'postal_code','')='') then raise exception 'Complete delivery address is required.'; end if;
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
  insert into public.orders(order_reference,idempotency_key,customer_name,mobile_number,house_unit,street,barangay,city_municipality,region,postal_code,order_notes,delivery_method,payment_method,selected_payment_option_name,merchandise_subtotal,shipping_fee,cod_service_fee,upfront_amount,rider_collectible_amount,showroom_payable_amount,overall_total,shipping_classification,payment_status,order_status,reservation_deadline)
  values(ref,(payload->>'idempotency_key')::uuid,payload->>'customer_name',payload->>'mobile_number',payload->>'house_unit',payload->>'street',payload->>'barangay',payload->>'city_municipality',payload->>'region',payload->>'postal_code',nullif(payload->>'order_notes',''),payload->>'delivery_method',payload->>'payment_method',nullif(payload->>'payment_option_name',''),subtotal,shipping,cod_fee,upfront,rider,showroom,total,case when has_bulky then 'bulky' else 'standard' end,'pending_verification',case when payload->>'payment_method'='pay_upon_pickup' then 'reservation_pending' else 'pending' end,case when payload->>'payment_method'='pay_upon_pickup' then now()+ interval '24 hours' else null end) returning id into new_id;
  for item in select * from jsonb_array_elements(payload->'items') loop select * into product_row from public.products where id=(item->>'product_id')::uuid; insert into public.order_items(order_id,product_id,product_name,price_snapshot,quantity,line_total) values(new_id,product_row.id,product_row.name,product_row.price,(item->>'quantity')::integer,product_row.price*(item->>'quantity')::integer); end loop;
  return query select new_id,ref,subtotal,shipping,cod_fee,upfront,rider,showroom,total;
end $$;
