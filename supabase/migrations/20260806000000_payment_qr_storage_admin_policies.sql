-- Explicit Storage rules for payment QR uploads. RLS remains enabled.
-- This replaces the earlier catch-all policy so every required Storage action
-- has a clear admin-role rule.
insert into storage.buckets (id, name, public)
values ('payment-qrs', 'payment-qrs', false)
on conflict (id) do update set public = false;

drop policy if exists "Admins manage payment QR images" on storage.objects;
drop policy if exists "Admins select payment QR images" on storage.objects;
drop policy if exists "Admins insert payment QR images" on storage.objects;
drop policy if exists "Admins update payment QR images" on storage.objects;
drop policy if exists "Admins delete payment QR images" on storage.objects;

create policy "Admins select payment QR images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-qrs'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Admins insert payment QR images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-qrs'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Admins update payment QR images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'payment-qrs'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    bucket_id = 'payment-qrs'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Admins delete payment QR images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-qrs'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
