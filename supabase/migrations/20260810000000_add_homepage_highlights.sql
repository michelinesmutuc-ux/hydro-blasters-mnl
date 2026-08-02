-- Manual homepage product placement. Existing products remain off by default.
alter table public.products
  add column if not exists show_on_homepage boolean not null default false,
  add column if not exists highlight_type text,
  add column if not exists homepage_sort_order integer;

alter table public.products
  drop constraint if exists products_highlight_type_check;

alter table public.products
  add constraint products_highlight_type_check
  check (highlight_type is null or highlight_type in (
    'new_arrival',
    'featured',
    'best_seller',
    'clearance_sale',
    'limited_stock'
  ));

create index if not exists products_homepage_highlights_idx
  on public.products (homepage_sort_order, name)
  where is_active = true and show_on_homepage = true;
