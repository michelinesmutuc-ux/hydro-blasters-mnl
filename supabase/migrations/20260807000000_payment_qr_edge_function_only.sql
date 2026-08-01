-- Browser writes to payment-qrs are retired. The upload-payment-qr Edge
-- Function uses the service-role client after authenticating an admin user.
alter table public.payment_method_options alter column qr_path drop not null;

drop policy if exists "Admins manage payment QR images" on storage.objects;
drop policy if exists "Admins select payment QR images" on storage.objects;
drop policy if exists "Admins insert payment QR images" on storage.objects;
drop policy if exists "Admins update payment QR images" on storage.objects;
drop policy if exists "Admins delete payment QR images" on storage.objects;
