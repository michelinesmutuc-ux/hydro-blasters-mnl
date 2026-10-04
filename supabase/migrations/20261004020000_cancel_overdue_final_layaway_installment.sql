create or replace function public.refresh_layaway_status(p_order_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare target public.orders%rowtype; missed smallint[]; first_missed smallint; second_missed smallint; today date;
begin
  today := (now() at time zone 'Asia/Manila')::date;
  select * into target from public.orders where id = p_order_id for update;
  if not found or target.payment_method <> 'layaway' then return null; end if;
  if target.layaway_status = 'cancelled' then return target.layaway_status; end if;

  select array_agg(installment_number order by installment_number) into missed
  from public.order_payments
  where order_id = target.id and payment_kind = 'installment'
    and due_date < today and payment_status in ('scheduled','due','rejected');
  if coalesce(array_length(missed, 1), 0) >= 2 then
    first_missed := missed[1]; second_missed := missed[2];
    if second_missed = first_missed + 1 then
      update public.orders set layaway_status = 'cancelled', order_status = 'cancelled', updated_at = now() where id = target.id;
      update public.order_payments set payment_status = 'cancelled' where order_id = target.id and payment_status in ('scheduled','due','rejected');
      return 'cancelled';
    end if;
  end if;
  if exists (
    select 1 from public.order_payments
    where order_id = target.id and payment_kind = 'installment' and installment_number = 3
      and due_date + interval '1 month' <= today and payment_status in ('scheduled','due','rejected')
  ) then
    update public.orders set layaway_status = 'cancelled', order_status = 'cancelled', updated_at = now() where id = target.id;
    update public.order_payments set payment_status = 'cancelled' where order_id = target.id and payment_status in ('scheduled','due','rejected');
    return 'cancelled';
  end if;
  if exists (select 1 from public.order_payments where order_id = target.id and payment_status <> 'verified') then return target.layaway_status; end if;
  update public.orders set layaway_status = 'paid', payment_status = 'verified', updated_at = now() where id = target.id;
  return 'paid';
end;
$$;

revoke all on function public.refresh_layaway_status(uuid) from public, anon, authenticated;
grant execute on function public.refresh_layaway_status(uuid) to service_role;
notify pgrst, 'reload schema';
