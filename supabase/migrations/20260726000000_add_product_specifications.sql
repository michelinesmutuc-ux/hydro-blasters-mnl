-- Product specifications: safe to paste into the Supabase SQL Editor more
-- than once. This intentionally keeps RLS enabled and only lets authenticated
-- users whose immutable app_metadata role is "admin" write specifications.

create table if not exists public.product_specifications (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  label text not null,
  value text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_specifications
  add column if not exists product_id uuid,
  add column if not exists label text,
  add column if not exists value text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.product_specifications
  alter column product_id set not null,
  alter column label set not null,
  alter column value set not null,
  alter column sort_order set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_specifications_product_id_fkey'
      and conrelid = 'public.product_specifications'::regclass
  ) then
    alter table public.product_specifications
      add constraint product_specifications_product_id_fkey
      foreign key (product_id) references public.products(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'product_specifications_label_not_blank'
      and conrelid = 'public.product_specifications'::regclass
  ) then
    alter table public.product_specifications
      add constraint product_specifications_label_not_blank
      check (char_length(trim(label)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'product_specifications_value_not_blank'
      and conrelid = 'public.product_specifications'::regclass
  ) then
    alter table public.product_specifications
      add constraint product_specifications_value_not_blank
      check (char_length(trim(value)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'product_specifications_sort_order_non_negative'
      and conrelid = 'public.product_specifications'::regclass
  ) then
    alter table public.product_specifications
      add constraint product_specifications_sort_order_non_negative
      check (sort_order >= 0);
  end if;
end;
$$;

create index if not exists product_specifications_product_id_sort_order_idx
  on public.product_specifications (product_id, sort_order, created_at);

create or replace function public.set_product_specifications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists product_specifications_set_updated_at on public.product_specifications;
create trigger product_specifications_set_updated_at
before update on public.product_specifications
for each row
execute function public.set_product_specifications_updated_at();

alter table public.product_specifications enable row level security;

drop policy if exists "Public can read product specifications" on public.product_specifications;
drop policy if exists "Development clients can manage product specifications" on public.product_specifications;
drop policy if exists "Anyone can read product specifications" on public.product_specifications;
drop policy if exists "Admins can insert product specifications" on public.product_specifications;
drop policy if exists "Admins can update product specifications" on public.product_specifications;
drop policy if exists "Admins can delete product specifications" on public.product_specifications;
drop policy if exists "Only admins can manage product specifications" on public.product_specifications;

create policy "Anyone can read product specifications"
  on public.product_specifications
  for select
  to anon, authenticated
  using (true);

create policy "Admins can insert product specifications"
  on public.product_specifications
  for insert
  to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can update product specifications"
  on public.product_specifications
  for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can delete product specifications"
  on public.product_specifications
  for delete
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Only admins can manage product specifications"
  on public.product_specifications
  as restrictive
  for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
