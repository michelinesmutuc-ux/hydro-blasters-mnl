-- The old restrictive product-image policy used "for all", which also applied
-- to SELECT requests for every Storage bucket. That prevented an admin from
-- creating signed URLs for private payment proofs.

drop policy if exists "Only admins can manage product images" on storage.objects;
drop policy if exists "Only admins can insert product images" on storage.objects;
drop policy if exists "Only admins can update product images" on storage.objects;
drop policy if exists "Only admins can delete product images" on storage.objects;

create policy "Only admins can insert product images"
  on storage.objects
  as restrictive
  for insert
  to authenticated
  with check (
    bucket_id = 'products'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Only admins can update product images"
  on storage.objects
  as restrictive
  for update
  to authenticated
  using (
    bucket_id = 'products'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    bucket_id = 'products'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Only admins can delete product images"
  on storage.objects
  as restrictive
  for delete
  to authenticated
  using (
    bucket_id = 'products'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
