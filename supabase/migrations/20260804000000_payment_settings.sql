create table if not exists public.payment_settings (
 id uuid primary key default gen_random_uuid(), method text not null unique check (method in ('gcash','bank_transfer','cash_on_delivery')),
 display_name text not null, masked_account_name text not null, masked_account_number text not null,
 qr_path text not null, enabled boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.payment_settings enable row level security;
drop policy if exists "Public reads enabled payment settings" on public.payment_settings;
drop policy if exists "Admins manage payment settings" on public.payment_settings;
create policy "Public reads enabled payment settings" on public.payment_settings for select to anon, authenticated using (enabled = true);
create policy "Admins manage payment settings" on public.payment_settings for all to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role')='admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role')='admin');
insert into storage.buckets (id,name,public) values ('payment-qrs','payment-qrs',true) on conflict (id) do update set public=true;
drop policy if exists "Admins manage payment QR images" on storage.objects;
create policy "Admins manage payment QR images" on storage.objects for all to authenticated using (bucket_id='payment-qrs' and (auth.jwt() -> 'app_metadata' ->> 'role')='admin') with check (bucket_id='payment-qrs' and (auth.jwt() -> 'app_metadata' ->> 'role')='admin');
