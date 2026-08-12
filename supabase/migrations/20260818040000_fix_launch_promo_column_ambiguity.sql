-- Fix only PL/pgSQL output-column ambiguity in reserve_launch_promo.
-- All reservation table columns are explicitly qualified with an alias.
-- No tables, rows, claims, orders, campaign settings, or promo rules change.

drop function if exists public.reserve_launch_promo(uuid, jsonb);
drop function if exists public.reserve_launch_promo(uuid, jsonb, boolean);

create function public.reserve_launch_promo(
  checkout_session uuid,
  items jsonb,
  allow_recheck boolean
)
returns table(
  status text,
  expires_at timestamptz,
  server_now timestamptz,
  eligible_subtotal numeric,
  discount_amount numeric
)
language plpgsql security definer set search_path = public as $$
declare
  promo public.launch_promo%rowtype;
  existing public.launch_promo_reservations%rowtype;
  item jsonb;
  product public.products%rowtype;
  variant public.product_variants%rowtype;
  quantity integer;
  price numeric;
  eligible numeric := 0;
  active_reservations integer := 0;
  has_active_reservation boolean := false;
begin
  if checkout_session is null then raise exception 'A checkout session is required.'; end if;

  update public.launch_promo_reservations as reservations
  set status = 'expired', updated_at = now()
  where reservations.status = 'reserved' and reservations.expires_at <= now();

  select * into existing from public.launch_promo_reservations as reservations
  where reservations.checkout_session_id = checkout_session for update;
  has_active_reservation := found and existing.status = 'reserved' and existing.expires_at > now();

  if found and existing.status = 'expired' and not allow_recheck then
    return query select 'expired', existing.expires_at, now(), existing.eligible_subtotal, 0::numeric;
    return;
  end if;
  if found and existing.status = 'claimed' then
    return query select 'unavailable', null::timestamptz, now(), existing.eligible_subtotal, 0::numeric;
    return;
  end if;
  if jsonb_array_length(coalesce(items, '[]'::jsonb)) = 0 then
    return query select 'unavailable', null::timestamptz, now(), 0::numeric, 0::numeric;
    return;
  end if;

  for item in select * from jsonb_array_elements(items) loop
    quantity := greatest(0, coalesce((item->>'quantity')::integer, 0));
    select * into product from public.products as products where products.id = (item->>'product_id')::uuid and products.is_active = true;
    if not found then raise exception 'A product is no longer available.'; end if;
    if coalesce(product.has_variants, false) then
      select * into variant from public.product_variants as variants where variants.id = (item->>'variant_id')::uuid and variants.product_id = product.id;
      if not found then raise exception 'The selected variant is no longer available.'; end if;
      price := variant.price;
    else price := product.price; end if;
    if not product.is_clearance then eligible := eligible + price * quantity; end if;
  end loop;

  if eligible <= 0 then
    if has_active_reservation then
      update public.launch_promo_reservations as reservations
      set eligible_subtotal = 0, discount_amount = 0, updated_at = now()
      where reservations.id = existing.id;
      return query select 'reserved', existing.expires_at, now(), 0::numeric, 0::numeric;
    else
      return query select 'unavailable', null::timestamptz, now(), eligible, 0::numeric;
    end if;
    return;
  end if;

  select * into promo from public.launch_promo as campaign where campaign.id = true for update;
  if not found then
    return query select 'unavailable', null::timestamptz, now(), eligible, 0::numeric;
    return;
  end if;
  if has_active_reservation then
    update public.launch_promo_reservations as reservations
    set eligible_subtotal = eligible,
        discount_amount = least(round(eligible * promo.discount_percent, 2), promo.maximum_discount, eligible),
        updated_at = now()
    where reservations.id = existing.id returning * into existing;
    return query select 'reserved', existing.expires_at, now(), existing.eligible_subtotal, existing.discount_amount;
    return;
  end if;
  if not promo.active then
    return query select 'unavailable', null::timestamptz, now(), eligible, 0::numeric;
    return;
  end if;

  select count(*) into active_reservations from public.launch_promo_reservations as reservations
  where reservations.status = 'reserved' and reservations.expires_at > now();
  if promo.claimed_redemptions + active_reservations >= promo.max_redemptions then
    return query select 'unavailable', null::timestamptz, now(), eligible, 0::numeric;
    return;
  end if;

  insert into public.launch_promo_reservations(checkout_session_id, status, reserved_at, expires_at, eligible_subtotal, discount_amount, claim_kind)
  values (checkout_session, 'reserved', now(), now() + interval '20 minutes', eligible, least(round(eligible * promo.discount_percent, 2), promo.maximum_discount, eligible), 'primary')
  on conflict (checkout_session_id) do update set status = 'reserved', reserved_at = now(), expires_at = now() + interval '20 minutes', eligible_subtotal = excluded.eligible_subtotal, discount_amount = excluded.discount_amount, claim_kind = 'primary', updated_at = now()
  returning * into existing;

  return query select 'reserved', existing.expires_at, now(), existing.eligible_subtotal, existing.discount_amount;
end;
$$;

revoke all on function public.reserve_launch_promo(uuid, jsonb, boolean) from public;
grant execute on function public.reserve_launch_promo(uuid, jsonb, boolean) to anon, authenticated;

create function public.reserve_launch_promo(checkout_session uuid, items jsonb)
returns table(status text, expires_at timestamptz, server_now timestamptz, eligible_subtotal numeric, discount_amount numeric)
language sql security definer set search_path = public as $$
  select * from public.reserve_launch_promo(checkout_session, items, false);
$$;

revoke all on function public.reserve_launch_promo(uuid, jsonb) from public;
grant execute on function public.reserve_launch_promo(uuid, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
