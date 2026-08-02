alter table public.orders
  add column if not exists telegram_notification_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_telegram_notification_type_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_telegram_notification_type_check
      check (telegram_notification_type is null or telegram_notification_type in ('photo', 'text-fallback', 'text', 'failed'));
  end if;
end $$;
