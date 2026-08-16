alter table public.orders
  add column if not exists courier text,
  add column if not exists tracking_number text;
