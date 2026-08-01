create table if not exists public.showroom_appointments (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null, mobile_number text not null,
  preferred_date date not null, preferred_time time not null,
  products_of_interest text not null, additional_notes text,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','completed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.showroom_appointments enable row level security;
drop policy if exists "Admins manage showroom appointments" on public.showroom_appointments;
create policy "Admins manage showroom appointments" on public.showroom_appointments for all to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
