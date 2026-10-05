-- Layaway payment state is authoritative only in order_payments. Prevent the
-- legacy order-level payment selector from falsely marking a payment verified.
create or replace function public.prevent_direct_layaway_payment_status_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.payment_method = 'layaway'
    and new.payment_status is distinct from old.payment_status
    and not (
      new.payment_status = 'verified'
      and new.layaway_status = 'paid'
      and not exists (
        select 1 from public.order_payments
        where order_id = old.id and payment_status <> 'verified'
      )
    ) then
    raise exception 'Verify Layaway payment transactions from the Layaway payments section.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_direct_layaway_payment_status_update_before_update on public.orders;
create trigger prevent_direct_layaway_payment_status_update_before_update
before update of payment_status on public.orders
for each row execute function public.prevent_direct_layaway_payment_status_update();
