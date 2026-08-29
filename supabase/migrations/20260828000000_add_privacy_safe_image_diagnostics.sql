create table public.image_diagnostics (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session_id uuid not null,
  event_code text not null check (event_code in (
    'image_load_failed', 'image_retry_started', 'image_retry_succeeded', 'image_retry_failed'
  )),
  page_context text not null check (page_context in (
    'home', 'shop', 'product_detail', 'gallery', 'cart', 'addon', 'compare'
  )),
  pathname text not null check (
    char_length(pathname) between 1 and 160
    and left(pathname, 1) = '/'
    and position('?' in pathname) = 0
    and position('#' in pathname) = 0
  ),
  object_key_hash text not null check (object_key_hash ~ '^[0-9a-f]{64}$'),
  image_hostname text not null check (image_hostname = 'hydro-blasters-mnl.pages.dev'),
  browser_family text not null check (browser_family in ('chrome', 'safari', 'firefox', 'edge', 'other')),
  device_class text not null check (device_class in ('mobile', 'desktop')),
  online boolean not null,
  natural_width integer not null check (natural_width between 0 and 10000),
  natural_height integer not null check (natural_height between 0 and 10000),
  failure_count smallint not null check (failure_count between 1 and 100),
  hydrated boolean not null,
  app_version text check (app_version is null or char_length(app_version) <= 64)
);

comment on table public.image_diagnostics is
  'Anonymous technical product-image events only. Never store customer data, IP addresses, cart contents, filenames, image contents, cookies, tokens, payment details, or raw exceptions.';

create index image_diagnostics_session_created_idx
  on public.image_diagnostics (session_id, created_at desc);

create index image_diagnostics_retention_idx
  on public.image_diagnostics (created_at);

alter table public.image_diagnostics enable row level security;

revoke all on table public.image_diagnostics from public, anon, authenticated;
grant insert on table public.image_diagnostics to anon, authenticated;
grant usage, select on sequence public.image_diagnostics_id_seq to anon, authenticated;

create policy "Anonymous clients can append constrained image diagnostics"
  on public.image_diagnostics
  for insert
  to anon, authenticated
  with check (created_at >= now() - interval '5 minutes' and created_at <= now() + interval '1 minute');

create schema if not exists image_private;
revoke all on schema image_private from public, anon, authenticated;

create function image_private.enforce_image_diagnostic_retention()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  delete from public.image_diagnostics
  where created_at < now() - interval '30 days';
  return new;
end;
$$;

revoke all on function image_private.enforce_image_diagnostic_retention() from public, anon, authenticated;

create trigger enforce_image_diagnostic_retention
before insert on public.image_diagnostics
for each statement execute function image_private.enforce_image_diagnostic_retention();
