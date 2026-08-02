alter table public.orders
  add column if not exists is_test_order boolean not null default false,
  add column if not exists archived_at timestamptz;

create index if not exists orders_active_cleanup_idx on public.orders (archived_at, is_test_order, created_at desc);

drop policy if exists "Admins delete payment proofs" on storage.objects;
create policy "Admins delete payment proofs"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
