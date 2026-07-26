-- Requires Supabase Auth. Only users with immutable app_metadata.role =
-- "admin" may change products or product images. Public catalogue reads are
-- left to the existing read policies.

alter table public.products enable row level security;

revoke insert, update, delete on public.products from anon;
grant insert, update, delete on public.products to authenticated;

drop policy if exists "Admins can manage products" on public.products;
drop policy if exists "Only admins can manage products" on public.products;
create policy "Admins can manage products"
  on public.products
  for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Only admins can manage products"
  as restrictive
  on public.products
  for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Existing development Storage policies can remain in place, but anonymous
-- writes are removed at the privilege level. The restrictive policy ensures
-- any other permissive policy still requires the administrator claim.
revoke insert, update, delete on storage.objects from anon;
grant insert, update, delete on storage.objects to authenticated;

drop policy if exists "Admins can manage product images" on storage.objects;
drop policy if exists "Only admins can manage product images" on storage.objects;
create policy "Admins can manage product images"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'products'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    bucket_id = 'products'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Only admins can manage product images"
  as restrictive
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'products'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    bucket_id = 'products'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
