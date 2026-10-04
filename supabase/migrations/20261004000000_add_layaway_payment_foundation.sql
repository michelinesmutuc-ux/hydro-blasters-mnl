-- Layaway remains one order. Each required payment is a row in this ledger;
-- amounts and eligibility are calculated only by the functions below.
alter table public.orders
  add column if not exists layaway_status text not null default 'not_applicable',
  add column if not exists layaway_price numeric(10,2),
  add column if not exists layaway_terms_accepted_at timestamptz,
  add column if not exists layaway_access_token_hash text,
  add column if not exists layaway_down_payment_verified_at timestamptz;

alter table public.orders drop constraint if exists orders_layaway_status_check;
alter table public.orders add constraint orders_layaway_status_check check (layaway_status in ('not_applicable','awaiting_down_payment','active','paid','cancelled'));
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('gcash','bank_transfer','cash_on_delivery','pay_upon_pickup','layaway'));

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  payment_batch_id uuid,
  payment_kind text not null check (payment_kind in ('down_payment','installment')),
  installment_number smallint check (installment_number between 1 and 3),
  merchandise_amount numeric(10,2) not null default 0 check (merchandise_amount >= 0),
  shipping_amount numeric(10,2) not null default 0 check (shipping_amount >= 0),
  late_fee_amount numeric(10,2) not null default 0 check (late_fee_amount >= 0),
  amount_due numeric(10,2) generated always as (merchandise_amount + shipping_amount + late_fee_amount) stored,
  amount_paid numeric(10,2) not null default 0 check (amount_paid >= 0),
  due_date date,
  payment_status text not null default 'scheduled' check (payment_status in ('scheduled','due','awaiting_proof','pending_verification','verified','rejected','cancelled')),
  payment_proof_path text,
  submitted_at timestamptz,
  verified_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((payment_kind = 'down_payment' and installment_number is null) or (payment_kind = 'installment' and installment_number is not null))
);
create unique index if not exists order_payments_one_kind_per_order on public.order_payments(order_id, payment_kind, coalesce(installment_number, 0));
create index if not exists order_payments_due_index on public.order_payments(order_id, payment_status, due_date);
create index if not exists order_payments_batch_index on public.order_payments(order_id, payment_batch_id) where payment_batch_id is not null;

alter table public.order_payments enable row level security;
drop policy if exists "Admins read layaway payments" on public.order_payments;
create policy "Admins read layaway payments" on public.order_payments for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create or replace function public.quote_layaway(payload jsonb)
returns table(merchandise_price numeric, shipping_fee numeric, layaway_price numeric, down_payment numeric, remaining_balance numeric, installment_one numeric, installment_two numeric, installment_three numeric, eligible boolean)
language plpgsql security definer set search_path = public as $$
declare item jsonb; product_row public.products%rowtype; variant_row public.product_variants%rowtype; item_price numeric; item_quantity integer; subtotal numeric := 0; units integer := 0; shipping numeric := 0; price numeric; dp numeric; balance numeric; first_payment numeric; second_payment numeric;
begin
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb)) = 0 then raise exception 'Your cart is empty.'; end if;
  for item in select * from jsonb_array_elements(payload->'items') loop
    item_quantity := (item->>'quantity')::integer; if item_quantity is null or item_quantity < 1 then raise exception 'Each item must have a valid quantity.'; end if;
    select * into product_row from public.products where id=(item->>'product_id')::uuid and is_active=true;
    if not found then raise exception 'A product is no longer available.'; end if;
    if coalesce(product_row.has_variants,false) then select * into variant_row from public.product_variants where id=(item->>'variant_id')::uuid and product_id=product_row.id; if not found then raise exception 'The selected variant is no longer available.'; end if; item_price:=variant_row.price; else item_price:=product_row.price; end if;
    subtotal := subtotal + item_price * item_quantity;
    units := units + (case product_row.shipping_class when 'Compact' then 1 when 'Standard' then 3 else 9 end) * item_quantity;
  end loop;
  if payload->>'delivery_method' = 'nationwide_delivery' then shipping := case when units <= 2 then 99 when units <= 8 then 149 else 249 end; end if;
  price := round(subtotal + 500,2); dp := round(price*.30,2); balance := price-dp; first_payment:=round(balance/3,2); second_payment:=first_payment;
  return query select subtotal,shipping,price,dp,balance,first_payment,second_payment,balance-first_payment-second_payment,subtotal>=4500;
end $$;
revoke all on function public.quote_layaway(jsonb) from public, anon, authenticated;
grant execute on function public.quote_layaway(jsonb) to service_role;

create or replace function public.layaway_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists layaway_set_updated_at_before_update on public.order_payments;
create trigger layaway_set_updated_at_before_update before update on public.order_payments
for each row execute function public.layaway_set_updated_at();

-- Used by service-role checkout code after creating an order with
-- payment_method = 'layaway'. It accepts a SHA-256 hash, never a raw code.
create or replace function public.initialize_layaway_order(
  p_order_id uuid,
  p_access_token_hash text,
  p_terms_accepted_at timestamptz default now()
)
returns table(order_id uuid, layaway_price numeric, down_payment numeric, access_code_required boolean)
language plpgsql security definer set search_path = public as $$
declare
  target public.orders%rowtype;
  price numeric(10,2);
  dp numeric(10,2);
begin
  if p_access_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Layaway access token hash is invalid.'; end if;
  select * into target from public.orders where id = p_order_id for update;
  if not found or target.payment_method <> 'layaway' then raise exception 'Layaway order not found.'; end if;
  if target.layaway_status <> 'not_applicable' or exists (select 1 from public.order_payments as op where op.order_id = target.id) then
    raise exception 'Layaway plan is already initialized.';
  end if;
  if p_terms_accepted_at is null then raise exception 'Layaway terms must be accepted.'; end if;
  if target.merchandise_subtotal < 4500 then raise exception 'Layaway is available for merchandise totals of ₱4,500 or more.'; end if;

  price := round(target.merchandise_subtotal + 500, 2);
  dp := round(price * 0.30, 2);
  update public.orders set
    layaway_status = 'awaiting_down_payment', layaway_price = price,
    layaway_terms_accepted_at = p_terms_accepted_at,
    layaway_access_token_hash = lower(p_access_token_hash),
    upfront_amount = dp, rider_collectible_amount = 0, showroom_payable_amount = 0,
    overall_total = price + shipping_fee, payment_status = 'pending_verification', updated_at = now()
  where id = target.id;
  insert into public.order_payments(order_id,payment_kind,merchandise_amount,due_date,payment_status)
  values(target.id,'down_payment',dp,current_date,'due');
  return query select target.id, price, dp, true;
end;
$$;

create or replace function public.refresh_layaway_status(p_order_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare target public.orders%rowtype; missed smallint[]; first_missed smallint; second_missed smallint;
begin
  select * into target from public.orders where id = p_order_id for update;
  if not found or target.payment_method <> 'layaway' then return null; end if;
  if target.layaway_status = 'cancelled' then return target.layaway_status; end if;

  select array_agg(installment_number order by installment_number) into missed
  from public.order_payments
  where order_id = target.id and payment_kind = 'installment'
    and due_date < current_date and payment_status in ('scheduled','due','rejected');
  if coalesce(array_length(missed, 1), 0) >= 2 then
    first_missed := missed[1]; second_missed := missed[2];
    if second_missed = first_missed + 1 then
      update public.orders set layaway_status = 'cancelled', order_status = 'cancelled', updated_at = now() where id = target.id;
      update public.order_payments set payment_status = 'cancelled' where order_id = target.id and payment_status in ('scheduled','due','rejected');
      return 'cancelled';
    end if;
  end if;
  if exists (select 1 from public.order_payments where order_id = target.id and payment_status <> 'verified') then
    return target.layaway_status;
  end if;
  update public.orders set layaway_status = 'paid', payment_status = 'verified', updated_at = now() where id = target.id;
  return 'paid';
end;
$$;

create or replace function public.schedule_layaway_installments()
returns trigger language plpgsql security definer set search_path = public as $$
declare target public.orders%rowtype; balance numeric(10,2); first_installment numeric(10,2); second_installment numeric(10,2); final_installment numeric(10,2); anchor_date date;
begin
  if new.payment_kind <> 'down_payment' or new.payment_status <> 'verified' or old.payment_status = 'verified' then return new; end if;
  select * into target from public.orders where id = new.order_id for update;
  if target.payment_method <> 'layaway' then return new; end if;
  anchor_date := new.verified_at::date;
  if anchor_date is null then raise exception 'A verified layaway payment requires a verification timestamp.'; end if;
  balance := target.layaway_price - new.merchandise_amount;
  first_installment := round(balance / 3, 2);
  second_installment := round(balance / 3, 2);
  final_installment := balance - first_installment - second_installment;
  insert into public.order_payments(order_id,payment_kind,installment_number,merchandise_amount,shipping_amount,due_date,payment_status)
  values
    (target.id,'installment',1,first_installment,0,(anchor_date + interval '1 month')::date,'scheduled'),
    (target.id,'installment',2,second_installment,0,(anchor_date + interval '2 months')::date,'scheduled'),
    (target.id,'installment',3,final_installment,target.shipping_fee,(anchor_date + interval '3 months')::date,'scheduled');
  update public.orders set layaway_status = 'active', layaway_down_payment_verified_at = new.verified_at, updated_at = now() where id = target.id;
  return new;
end;
$$;
drop trigger if exists schedule_layaway_installments_after_verification on public.order_payments;
create trigger schedule_layaway_installments_after_verification after update of payment_status on public.order_payments
for each row execute function public.schedule_layaway_installments();

create or replace function public.prepare_layaway_payment(p_order_id uuid, p_attempt uuid, p_pay_all boolean default false)
returns table(payment_batch_id uuid, total_due numeric, payment_ids uuid[])
language plpgsql security definer set search_path = public as $$
declare target public.orders%rowtype; selected_ids uuid[]; calculated_total numeric(10,2); has_pending boolean;
begin
  if p_attempt is null then raise exception 'Payment attempt is required.'; end if;
  select * into target from public.orders where id = p_order_id for update;
  if not found or target.payment_method <> 'layaway' then raise exception 'Layaway order not found.'; end if;
  if public.refresh_layaway_status(target.id) = 'cancelled' then
    -- Return a durable cancellation result instead of raising: a raised
    -- exception would roll back the cancellation in this same transaction.
    return query select null::uuid, 0::numeric, array[]::uuid[];
    return;
  end if;
  if target.layaway_status not in ('awaiting_down_payment','active') then raise exception 'This layaway is not eligible for payment.'; end if;

  select array_agg(id order by installment_number nulls first), sum(merchandise_amount + shipping_amount + late_fee_amount) into selected_ids, calculated_total
  from public.order_payments as op where op.order_id = target.id and op.payment_batch_id = p_attempt and op.payment_status in ('awaiting_proof','pending_verification');
  if selected_ids is not null then return query select p_attempt, calculated_total, selected_ids; return; end if;

  select exists(select 1 from public.order_payments as op where op.order_id = target.id and op.payment_status in ('awaiting_proof','pending_verification')) into has_pending;
  if has_pending then raise exception 'A layaway payment is already awaiting review.'; end if;

  if target.layaway_status = 'awaiting_down_payment' then
    select array_agg(id), sum(merchandise_amount) into selected_ids, calculated_total
    from public.order_payments as op where op.order_id = target.id and op.payment_kind = 'down_payment' and op.payment_status in ('due','rejected');
  elsif p_pay_all then
    select array_agg(id order by installment_number), sum(merchandise_amount + shipping_amount + case when due_date < current_date then round(merchandise_amount * case when current_date - due_date <= 7 then .05 else .10 end, 2) else 0 end) into selected_ids, calculated_total
    from public.order_payments as op where op.order_id = target.id and op.payment_kind = 'installment' and op.payment_status in ('scheduled','due','rejected');
  else
    select array_agg(id order by installment_number), sum(merchandise_amount + shipping_amount + case when due_date < current_date then round(merchandise_amount * case when current_date - due_date <= 7 then .05 else .10 end, 2) else 0 end) into selected_ids, calculated_total
    from public.order_payments as op where op.order_id = target.id and op.payment_kind = 'installment' and op.due_date <= current_date and op.payment_status in ('scheduled','due','rejected');
  end if;
  if selected_ids is null then raise exception 'No layaway payment is currently due. Use early full payment to settle the remaining balance.'; end if;

  update public.order_payments as op set
    payment_batch_id = p_attempt, payment_status = 'awaiting_proof', amount_paid = 0,
    late_fee_amount = case when payment_kind = 'installment' and due_date < current_date then round(merchandise_amount * case when current_date - due_date <= 7 then .05 else .10 end, 2) else 0 end,
    updated_at = now()
  where op.id = any(selected_ids);
  return query select p_attempt, calculated_total, selected_ids;
end;
$$;

create or replace function public.attach_layaway_payment_proof(p_order_id uuid, p_attempt uuid, p_proof_path text)
returns numeric language plpgsql security definer set search_path = public as $$
declare total numeric(10,2); target public.orders%rowtype;
begin
  select * into target from public.orders where id = p_order_id for update;
  if not found or target.payment_method <> 'layaway' then raise exception 'Layaway order not found.'; end if;
  if p_proof_path !~ ('^orders/' || target.order_reference || '/layaway/' || p_attempt::text || '\\.(jpg|png|webp)$') then raise exception 'Payment proof path is invalid.'; end if;
  update public.order_payments set payment_proof_path = p_proof_path, payment_status = 'pending_verification', submitted_at = now(), updated_at = now()
  where order_id = target.id and payment_batch_id = p_attempt and payment_status = 'awaiting_proof';
  if not found then raise exception 'Layaway payment submission is unavailable.'; end if;
  select sum(merchandise_amount + shipping_amount + late_fee_amount) into total from public.order_payments where order_id = target.id and payment_batch_id = p_attempt;
  return total;
end;
$$;

create or replace function public.reset_layaway_payment_attempt(p_order_id uuid, p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.order_payments set payment_batch_id = null, payment_proof_path = null, submitted_at = null, late_fee_amount = 0,
    payment_status = case when due_date <= current_date then 'due' else 'scheduled' end, updated_at = now()
  where order_id = p_order_id and payment_batch_id = p_attempt and payment_status = 'awaiting_proof';
end;
$$;

create or replace function public.verify_layaway_payment_batch(p_order_id uuid, p_attempt uuid, p_verified boolean)
returns numeric language plpgsql security definer set search_path = public as $$
declare total numeric(10,2); target public.orders%rowtype;
begin
  if current_setting('request.jwt.claim.role', true) not in ('service_role','authenticated') then raise exception 'Not authorized.'; end if;
  if current_setting('request.jwt.claim.role', true) = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') <> 'admin' then raise exception 'Not authorized.'; end if;
  select * into target from public.orders where id = p_order_id for update;
  if not found or target.payment_method <> 'layaway' then raise exception 'Layaway order not found.'; end if;
  if p_verified then
    update public.order_payments set payment_status = 'verified', amount_paid = merchandise_amount + shipping_amount + late_fee_amount, verified_at = now(), updated_at = now()
    where order_id = target.id and payment_batch_id = p_attempt and payment_status = 'pending_verification';
  else
    update public.order_payments set payment_status = 'rejected', amount_paid = 0, rejected_at = now(), updated_at = now()
    where order_id = target.id and payment_batch_id = p_attempt and payment_status = 'pending_verification';
  end if;
  if not found then raise exception 'Layaway payment batch is not awaiting verification.'; end if;
  select sum(merchandise_amount + shipping_amount + late_fee_amount) into total from public.order_payments where order_id = target.id and payment_batch_id = p_attempt;
  perform public.refresh_layaway_status(target.id);
  return total;
end;
$$;

create or replace function public.prevent_unpaid_layaway_fulfillment()
returns trigger language plpgsql security definer set search_path = public as $$
declare remaining integer;
begin
  if new.payment_method = 'layaway' and new.order_status in ('shipped','ready_for_rider','completed') and old.order_status is distinct from new.order_status then
    perform public.refresh_layaway_status(new.id);
    select count(*) into remaining from public.order_payments where order_id = new.id and payment_status <> 'verified';
    if (select layaway_status from public.orders where id = new.id) <> 'paid' or remaining <> 0 then
      raise exception 'Layaway orders cannot be released or fulfilled until every installment and the final shipping payment are verified.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_unpaid_layaway_fulfillment_before_update on public.orders;
create trigger prevent_unpaid_layaway_fulfillment_before_update before update of order_status on public.orders
for each row execute function public.prevent_unpaid_layaway_fulfillment();

revoke all on function public.initialize_layaway_order(uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_layaway_status(uuid) from public, anon, authenticated;
revoke all on function public.prepare_layaway_payment(uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.attach_layaway_payment_proof(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.reset_layaway_payment_attempt(uuid,uuid) from public, anon, authenticated;
revoke all on function public.verify_layaway_payment_batch(uuid,uuid,boolean) from public, anon;
grant execute on function public.verify_layaway_payment_batch(uuid,uuid,boolean) to authenticated;
grant execute on function public.initialize_layaway_order(uuid,text,timestamptz) to service_role;
grant execute on function public.refresh_layaway_status(uuid) to service_role;
grant execute on function public.prepare_layaway_payment(uuid,uuid,boolean) to service_role;
grant execute on function public.attach_layaway_payment_proof(uuid,uuid,text) to service_role;
grant execute on function public.reset_layaway_payment_attempt(uuid,uuid) to service_role;
grant execute on function public.verify_layaway_payment_batch(uuid,uuid,boolean) to service_role;

notify pgrst, 'reload schema';
