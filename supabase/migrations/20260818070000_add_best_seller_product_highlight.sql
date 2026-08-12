-- Independent merchandising flag. It does not change availability, pricing,
-- shipping, checkout, or Launch Promo eligibility.
alter table public.products
  add column if not exists is_best_seller boolean not null default false;

-- Keeps public active-product Best Seller filtering efficient as the catalogue grows.
create index if not exists products_active_best_seller_idx
  on public.products (is_best_seller)
  where is_active = true and is_best_seller = true;
