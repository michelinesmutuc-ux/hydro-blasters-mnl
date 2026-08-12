-- Optional, ordered product recommendations. Add-ons remain normal catalogue
-- products, so price, stock, shipping, Clearance, and order snapshots stay
-- authoritative on public.products.

create table if not exists public.product_addons (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  addon_product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  constraint product_addons_not_self check (product_id <> addon_product_id),
  constraint product_addons_unique_pair unique (product_id, addon_product_id)
);

create index if not exists product_addons_product_sort_idx
  on public.product_addons (product_id, sort_order);

alter table public.product_addons enable row level security;

drop policy if exists "Admins manage product add-ons" on public.product_addons;
create policy "Admins manage product add-ons"
  on public.product_addons
  for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Public reads active product add-ons" on public.product_addons;
create policy "Public reads active product add-ons"
  on public.product_addons
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.products parent_product
      where parent_product.id = product_addons.product_id
        and parent_product.is_active = true
    )
    and exists (
      select 1 from public.products addon_product
      where addon_product.id = product_addons.addon_product_id
        and addon_product.is_active = true
    )
  );

grant select on public.product_addons to anon, authenticated;
grant insert, update, delete on public.product_addons to authenticated;
