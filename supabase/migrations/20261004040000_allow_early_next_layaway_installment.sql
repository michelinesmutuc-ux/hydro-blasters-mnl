-- Reserve only the first unpaid future installment for a voluntary early payment.
-- Existing due, catch-up, and early-full-payoff behavior remains in prepare_layaway_payment.
create or replace function public.prepare_next_layaway_payment(p_order_id uuid, p_attempt uuid)
returns table(payment_batch_id uuid, total_due numeric, payment_ids uuid[])
language plpgsql security definer set search_path = public as $$
declare target public.orders%rowtype; next_payment public.order_payments%rowtype; selected_ids uuid[]; calculated_total numeric(10,2); has_pending boolean;
begin
  if p_attempt is null then raise exception 'Payment attempt is required.'; end if;
  select * into target from public.orders where id = p_order_id for update;
  if not found or target.payment_method <> 'layaway' then raise exception 'Layaway order not found.'; end if;
  if public.refresh_layaway_status(target.id) = 'cancelled' then
    return query select null::uuid, 0::numeric, array[]::uuid[];
    return;
  end if;
  if target.layaway_status <> 'active' then raise exception 'This layaway is not eligible for an installment payment.'; end if;

  select array_agg(id order by installment_number), sum(merchandise_amount + shipping_amount + late_fee_amount)
    into selected_ids, calculated_total
  from public.order_payments as op
  where op.order_id = target.id and op.payment_batch_id = p_attempt and op.payment_status in ('awaiting_proof','pending_verification');
  if selected_ids is not null then return query select p_attempt, calculated_total, selected_ids; return; end if;

  select exists(select 1 from public.order_payments as op where op.order_id = target.id and op.payment_status in ('awaiting_proof','pending_verification')) into has_pending;
  if has_pending then raise exception 'A layaway payment is already awaiting review.'; end if;

  select * into next_payment from public.order_payments as op
  where op.order_id = target.id and op.payment_kind = 'installment' and op.payment_status in ('scheduled','due','rejected')
  order by op.installment_number limit 1 for update;
  if not found then raise exception 'No unpaid layaway installment is available.'; end if;
  if next_payment.due_date <= current_date then
    raise exception 'A layaway payment is currently due. Pay all currently due installments and fees together.';
  end if;

  update public.order_payments set payment_batch_id = p_attempt, payment_status = 'awaiting_proof', amount_paid = 0, late_fee_amount = 0, updated_at = now()
  where id = next_payment.id;
  return query select p_attempt, next_payment.merchandise_amount + next_payment.shipping_amount, array[next_payment.id];
end;
$$;

revoke all on function public.prepare_next_layaway_payment(uuid,uuid) from public, anon, authenticated;
grant execute on function public.prepare_next_layaway_payment(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
