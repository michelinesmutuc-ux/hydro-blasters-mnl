-- Retires the database-managed payment QR system. Product QR files move into
-- public/payment-qrs/ in this Next.js project instead.
alter table public.orders add column if not exists selected_payment_option_name text;
drop policy if exists "Public reads enabled payment QR images" on storage.objects;
drop policy if exists "Admins manage payment QR images" on storage.objects;
drop policy if exists "Admins select payment QR images" on storage.objects;
drop policy if exists "Admins insert payment QR images" on storage.objects;
drop policy if exists "Admins update payment QR images" on storage.objects;
drop policy if exists "Admins delete payment QR images" on storage.objects;

delete from storage.objects where bucket_id = 'payment-qrs';
delete from storage.buckets where id = 'payment-qrs';

drop table if exists public.payment_method_options cascade;
drop table if exists public.payment_settings cascade;

create or replace function public.create_guest_order(payload jsonb)
returns table(order_id uuid, order_reference text, merchandise_subtotal numeric, shipping_fee numeric, cod_service_fee numeric, upfront_amount numeric, rider_collectible_amount numeric, showroom_payable_amount numeric, overall_total numeric)
language plpgsql security definer set search_path = public as $$
declare item jsonb; product_row public.products%rowtype; subtotal numeric := 0; shipping numeric := 0; cod_fee numeric := 0; upfront numeric := 0; rider numeric := 0; showroom numeric := 0; total numeric := 0; has_bulky boolean := false; new_id uuid; ref text; bank_name text;
begin
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb)) = 0 then raise exception 'Your cart is empty.'; end if;
  if coalesce(payload->>'customer_name','') = '' or coalesce(payload->>'mobile_number','') = '' then raise exception 'Full name and mobile number are required.'; end if;
  if payload->>'delivery_method' = 'nationwide_delivery' and (coalesce(payload->>'house_unit','')='' or coalesce(payload->>'street','')='' or coalesce(payload->>'barangay','')='' or coalesce(payload->>'city_municipality','')='' or coalesce(payload->>'region','')='' or coalesce(payload->>'postal_code','')='') then raise exception 'Complete delivery address is required.'; end if;
  bank_name := nullif(trim(payload->>'payment_option_name'), '');
  if payload->>'payment_method' = 'bank_transfer' and bank_name is null then raise exception 'Choose your bank before placing your order.'; end if;
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
  values(ref,(payload->>'idempotency_key')::uuid,payload->>'customer_name',payload->>'mobile_number',payload->>'house_unit',payload->>'street',payload->>'barangay',payload->>'city_municipality',payload->>'region',payload->>'postal_code',nullif(payload->>'order_notes',''),payload->>'delivery_method',payload->>'payment_method',bank_name,subtotal,shipping,cod_fee,upfront,rider,showroom,total,case when has_bulky then 'bulky' else 'standard' end,'pending_verification',case when payload->>'payment_method'='pay_upon_pickup' then 'reservation_pending' else 'pending' end,case when payload->>'payment_method'='pay_upon_pickup' then now()+ interval '24 hours' else null end) returning id into new_id;
  for item in select * from jsonb_array_elements(payload->'items') loop select * into product_row from public.products where id=(item->>'product_id')::uuid; insert into public.order_items(order_id,product_id,product_name,price_snapshot,quantity,line_total) values(new_id,product_row.id,product_row.name,product_row.price,(item->>'quantity')::integer,product_row.price*(item->>'quantity')::integer); end loop;
  return query select new_id,ref,subtotal,shipping,cod_fee,upfront,rider,showroom,total;
end $$;
