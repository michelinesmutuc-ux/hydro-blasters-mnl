create table public.checkout_diagnostics (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  attempt_id uuid not null,
  event_code text not null check (event_code in (
    'promo_started', 'promo_completed', 'promo_failed', 'promo_timed_out',
    'proof_selected', 'proof_accepted', 'proof_rejected',
    'file_read_started', 'file_read_completed', 'file_read_failed',
    'disabled_state_changed',
    'submit_clicked', 'edge_invoke_started', 'edge_invoke_completed',
    'edge_invoke_failed', 'edge_invoke_timed_out'
  )),
  phase text not null check (phase in ('promo', 'proof_selection', 'proof_processing', 'submission')),
  disabled_reasons text[] not null default '{}' check (cardinality(disabled_reasons) <= 8),
  device_class text not null check (device_class in ('mobile', 'desktop')),
  browser_family text not null check (browser_family in ('chrome', 'safari', 'firefox', 'edge', 'other')),
  mime_category text check (mime_category is null or mime_category in ('jpeg', 'png', 'webp', 'other', 'missing')),
  size_bucket text check (size_bucket is null or size_bucket in ('empty', 'under_1mb', '1_to_5mb', 'over_5mb')),
  error_code text check (error_code is null or char_length(error_code) <= 64),
  online boolean not null,
  app_version text check (app_version is null or char_length(app_version) <= 64)
);

comment on table public.checkout_diagnostics is
  'Anonymous technical checkout events only. Never store customer data, filenames, proof contents, payment details, request payloads, or raw exceptions.';

create index checkout_diagnostics_attempt_created_idx
  on public.checkout_diagnostics (attempt_id, created_at desc);

create index checkout_diagnostics_retention_idx
  on public.checkout_diagnostics (created_at);

alter table public.checkout_diagnostics enable row level security;

revoke all on table public.checkout_diagnostics from public, anon, authenticated;
grant insert on table public.checkout_diagnostics to anon, authenticated;
grant usage, select on sequence public.checkout_diagnostics_id_seq to anon, authenticated;

create policy "Anonymous clients can append constrained checkout diagnostics"
  on public.checkout_diagnostics
  for insert
  to anon, authenticated
  with check (created_at >= now() - interval '5 minutes' and created_at <= now() + interval '1 minute');

create schema if not exists checkout_private;
revoke all on schema checkout_private from public, anon, authenticated;

create function checkout_private.enforce_checkout_diagnostic_retention()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  delete from public.checkout_diagnostics
  where created_at < now() - interval '30 days';
  return new;
end;
$$;

revoke all on function checkout_private.enforce_checkout_diagnostic_retention() from public, anon, authenticated;

create trigger enforce_checkout_diagnostic_retention
before insert on public.checkout_diagnostics
for each statement execute function checkout_private.enforce_checkout_diagnostic_retention();
