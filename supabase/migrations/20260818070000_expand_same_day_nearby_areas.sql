-- Expand only the Same-Day / On-Demand nearby-area allowlist. No pricing,
-- payment, Ready-for-Rider, promo, or delivery workflow rules change here.

alter table public.same_day_delivery_nearby_cities
  add column if not exists province text;

update public.same_day_delivery_nearby_cities
set province = ''
where province is null;

alter table public.same_day_delivery_nearby_cities
  alter column province set default '',
  alter column province set not null;

do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.same_day_delivery_nearby_cities'::regclass
    and contype = 'p';
  if constraint_name is not null then
    execute format('alter table public.same_day_delivery_nearby_cities drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.same_day_delivery_nearby_cities
  add constraint same_day_delivery_nearby_cities_pkey primary key (city, province);

insert into public.same_day_delivery_nearby_cities (city, province, active)
values
  ('Cainta', 'Rizal', true),
  ('Taytay', 'Rizal', true),
  ('Antipolo', 'Rizal', true),
  ('Angono', 'Rizal', true),
  ('Binangonan', 'Rizal', true),
  ('San Mateo', 'Rizal', true),
  ('Bacoor', 'Cavite', true),
  ('Imus', 'Cavite', true),
  ('Kawit', 'Cavite', true),
  ('Noveleta', 'Cavite', true),
  ('Rosario', 'Cavite', true),
  ('General Trias', 'Cavite', true),
  ('Dasmariñas', 'Cavite', true),
  ('Obando', 'Bulacan', true),
  ('Meycauayan', 'Bulacan', true),
  ('Marilao', 'Bulacan', true),
  ('Bocaue', 'Bulacan', true),
  ('San Pedro', 'Laguna', true),
  ('Biñan', 'Laguna', true),
  ('Santa Rosa', 'Laguna', true)
on conflict (city, province) do update
set active = excluded.active,
    updated_at = now();

drop policy if exists "Admins manage same-day delivery nearby cities" on public.same_day_delivery_nearby_cities;
create policy "Admins manage same-day delivery nearby cities"
on public.same_day_delivery_nearby_cities for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create or replace function public.enforce_same_day_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  normalised_city text;
  normalised_region text;
begin
  if new.delivery_method <> 'same_day_delivery' then return new; end if;

  if new.payment_method in ('cash_on_delivery', 'pay_upon_pickup') then
    raise exception 'Same-Day / On-Demand Delivery is prepaid only.';
  end if;

  normalised_city := lower(regexp_replace(regexp_replace(regexp_replace(translate(trim(coalesce(new.city_municipality, '')), 'ñÑ', 'nN'), '[.,]', '', 'g'), '^city of[[:space:]]+', '', 'i'), '[[:space:]]+city$', '', 'i'));
  normalised_city := regexp_replace(normalised_city, '[[:space:]]+', ' ', 'g');
  normalised_region := lower(regexp_replace(regexp_replace(regexp_replace(translate(trim(coalesce(new.region, '')), 'ñÑ', 'nN'), '[.,]', '', 'g'), '^province of[[:space:]]+', '', 'i'), '[[:space:]]+province$', '', 'i'));
  normalised_region := regexp_replace(normalised_region, '[[:space:]]+', ' ', 'g');

  if normalised_city not in (
    'caloocan', 'las pinas', 'makati', 'malabon', 'mandaluyong', 'manila',
    'marikina', 'muntinlupa', 'navotas', 'paranaque', 'pasay', 'pasig',
    'pateros', 'quezon city', 'san juan', 'taguig', 'valenzuela'
  ) and not exists (
    select 1
    from public.same_day_delivery_nearby_cities nearby
    where nearby.active = true
      and lower(regexp_replace(regexp_replace(regexp_replace(translate(trim(nearby.city), 'ñÑ', 'nN'), '[.,]', '', 'g'), '^city of[[:space:]]+', '', 'i'), '[[:space:]]+city$', '', 'i')) = normalised_city
      and lower(regexp_replace(regexp_replace(regexp_replace(translate(trim(nearby.province), 'ñÑ', 'nN'), '[.,]', '', 'g'), '^province of[[:space:]]+', '', 'i'), '[[:space:]]+province$', '', 'i')) = normalised_region
  ) then
    raise exception 'Same-Day / On-Demand Delivery is available only in Metro Manila and selected nearby areas.';
  end if;

  new.shipping_fee := 0;
  new.shipping_tier := 'On-Demand';
  new.shipping_classification := 'on-demand';
  new.same_day_processing := case when (now() at time zone 'Asia/Manila')::time < time '15:00'
    then 'same_day_processing' else 'next_day_processing' end;
  return new;
end;
$$;

notify pgrst, 'reload schema';
