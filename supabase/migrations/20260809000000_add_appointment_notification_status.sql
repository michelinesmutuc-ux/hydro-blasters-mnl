alter table public.showroom_appointments
  add column if not exists admin_notification_sent_at timestamptz,
  add column if not exists admin_notification_attempted_at timestamptz,
  add column if not exists admin_notification_error text;

create index if not exists showroom_appointments_notification_status_idx
  on public.showroom_appointments (admin_notification_sent_at, admin_notification_attempted_at);
