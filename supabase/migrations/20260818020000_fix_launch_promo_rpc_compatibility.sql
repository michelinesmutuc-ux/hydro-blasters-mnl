-- Launch Promo RPC compatibility and read-only cart lookup.
-- Safe after the existing reservation migrations; does not change claims,
-- reservations, products, orders, or campaign settings.

-- Older deployed checkout bundles call the two-argument RPC. PostgreSQL's
-- optional parameters are not consistently resolved by every PostgREST schema
-- cache, so provide the exact signature as a compatibility wrapper.
create or replace function public.reserve_launch_promo(checkout_session uuid, items jsonb)
returns table(status text, expires_at timestamptz, server_now timestamptz, eligible_subtotal numeric, discount_amount numeric)
language sql security definer set search_path = public as $$
  select * from public.reserve_launch_promo(checkout_session, items, false);
$$;

revoke all on function public.reserve_launch_promo(uuid, jsonb) from public;
grant execute on function public.reserve_launch_promo(uuid, jsonb) to anon, authenticated;

-- Cart may read an existing reservation for its own browser session, but this
-- function never creates, extends, or modifies a reservation.
create or replace function public.get_launch_promo_reservation(checkout_session uuid)
returns table(status text, expires_at timestamptz, server_now timestamptz, eligible_subtotal numeric, discount_amount numeric)
language plpgsql security definer set search_path = public as $$
declare existing public.launch_promo_reservations%rowtype;
begin
  if checkout_session is null then return; end if;
  update public.launch_promo_reservations
  set status = 'expired', updated_at = now()
  where checkout_session_id = $1
    and status = 'reserved' and expires_at <= now();
  select * into existing from public.launch_promo_reservations
  where checkout_session_id = $1;
  if found then
    return query select existing.status, existing.expires_at, now(), existing.eligible_subtotal,
      case when existing.status = 'reserved' and existing.expires_at > now() then existing.discount_amount else 0::numeric end;
  end if;
end;
$$;

revoke all on function public.get_launch_promo_reservation(uuid) from public;
grant execute on function public.get_launch_promo_reservation(uuid) to anon, authenticated;
