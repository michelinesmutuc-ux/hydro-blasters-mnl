-- Same-Day / On-Demand Delivery. This does not call courier APIs and does not
-- change nationwide shipping-class calculations.

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%delivery_method%'
  loop
    execute format('alter table public.orders drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.orders
  add constraint orders_delivery_method_check
  check (delivery_method in ('nationwide_delivery', 'same_day_delivery', 'showroom_pickup'));

alter table public.orders add column if not exists same_day_processing text;
alter table public.orders add column if not exists rider_ready_at timestamptz;
alter table public.orders drop constraint if exists orders_same_day_processing_check;
alter table public.orders add constraint orders_same_day_processing_check
  check (same_day_processing is null or same_day_processing in ('same_day_processing', 'next_day_processing'));
alter table public.orders drop constraint if exists orders_shipping_tier_check;
alter table public.orders add constraint orders_shipping_tier_check
  check (shipping_tier in ('Compact', 'Standard', 'Bulky', 'On-Demand'));

-- Only the merchant may add non-Metro-Manila cities. The public website can
-- read the active city names solely to decide whether to show this delivery option.
create table if not exists public.same_day_delivery_nearby_cities (
  city text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.same_day_delivery_nearby_cities enable row level security;
drop policy if exists "Public can read active same-day delivery nearby cities" on public.same_day_delivery_nearby_cities;
create policy "Public can read active same-day delivery nearby cities"
on public.same_day_delivery_nearby_cities for select to anon, authenticated
using (active = true);

create or replace function public.enforce_same_day_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
declare normalised_city text;
begin
  if new.delivery_method <> 'same_day_delivery' then return new; end if;

  if new.payment_method in ('cash_on_delivery', 'pay_upon_pickup') then
    raise exception 'Same-Day / On-Demand Delivery is prepaid only.';
  end if;

  normalised_city := lower(regexp_replace(trim(coalesce(new.city_municipality, '')), '\\s+', ' ', 'g'));
  if normalised_city not in (
    'caloocan', 'las pinas', 'las piñas', 'makati', 'malabon', 'mandaluyong',
    'manila', 'marikina', 'muntinlupa', 'muntinlupa city', 'navotas',
    'paranaque', 'parañaque', 'pasay', 'pasig', 'quezon city', 'san juan',
    'taguig', 'valenzuela'
  ) and not exists (
    select 1 from public.same_day_delivery_nearby_cities nearby
    where nearby.active = true
      and lower(regexp_replace(trim(nearby.city), '\s+', ' ', 'g')) = normalised_city
  ) then
    raise exception 'Same-Day / On-Demand Delivery is available only in Metro Manila and selected nearby cities.';
  end if;

  new.shipping_fee := 0;
  new.shipping_tier := 'On-Demand';
  new.shipping_classification := 'on-demand';
  new.same_day_processing := case when (now() at time zone 'Asia/Manila')::time < time '15:00'
    then 'same_day_processing' else 'next_day_processing' end;
  return new;
end;
$$;

drop trigger if exists enforce_same_day_delivery_before_insert on public.orders;
create trigger enforce_same_day_delivery_before_insert
before insert on public.orders
for each row execute function public.enforce_same_day_delivery();

-- Verification time, rather than a customer's device clock, is authoritative
-- for the final Same-Day / Next-Day processing snapshot.
create or replace function public.set_same_day_processing_on_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.delivery_method = 'same_day_delivery'
    and new.payment_status = 'verified'
    and old.payment_status is distinct from 'verified' then
    new.same_day_processing := case when (now() at time zone 'Asia/Manila')::time < time '15:00'
      then 'same_day_processing' else 'next_day_processing' end;
  end if;
  return new;
end;
$$;

drop trigger if exists set_same_day_processing_on_verification_before_update on public.orders;
create trigger set_same_day_processing_on_verification_before_update
before update of payment_status on public.orders
for each row execute function public.set_same_day_processing_on_verification();

-- Keep a customer-visible historical timestamp when the merchant marks a
-- same-day order as ready. This is not set for any other order type.
create or replace function public.set_same_day_rider_ready_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.delivery_method = 'same_day_delivery'
    and new.order_status = 'ready_for_rider'
    and old.order_status is distinct from 'ready_for_rider' then
    if new.payment_status <> 'verified' then
      raise exception 'Verify payment before marking a Same-Day order Ready for Rider.';
    end if;
    new.rider_ready_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_same_day_rider_ready_at_before_update on public.orders;
create trigger set_same_day_rider_ready_at_before_update
before update of order_status on public.orders
for each row execute function public.set_same_day_rider_ready_at();

notify pgrst, 'reload schema';
