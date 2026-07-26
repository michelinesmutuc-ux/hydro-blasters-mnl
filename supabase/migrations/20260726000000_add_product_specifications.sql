create table public.product_specifications (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null check (char_length(trim(label)) > 0),
  value text not null check (char_length(trim(value)) > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_specifications_product_id_sort_order_idx
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

create trigger product_specifications_set_updated_at
before update on public.product_specifications
for each row
execute function public.set_product_specifications_updated_at();

alter table public.product_specifications enable row level security;

-- These mirror the current browser-managed product workflow. Replace the
-- development write policy with an authenticated-admin policy when admin
-- authentication is introduced.
create policy "Public can read product specifications"
  on public.product_specifications
  for select
  to anon
  using (true);

create policy "Development clients can manage product specifications"
  on public.product_specifications
  for all
  to anon
  using (true)
  with check (true);
