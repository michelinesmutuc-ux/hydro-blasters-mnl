-- Correct the escaped extension delimiter in the initial Layaway proof path.
create or replace function public.attach_layaway_payment_proof(p_order_id uuid, p_attempt uuid, p_proof_path text)
returns numeric language plpgsql security definer set search_path = public as $$
declare total numeric(10,2); target public.orders%rowtype;
begin
  select * into target from public.orders where id = p_order_id for update;
  if not found or target.payment_method <> 'layaway' then raise exception 'Layaway order not found.'; end if;
  if p_proof_path !~ ('^orders/' || target.order_reference || '/layaway/' || p_attempt::text || '\.(jpg|png|webp)$') then raise exception 'Payment proof path is invalid.'; end if;
  update public.order_payments set payment_proof_path = p_proof_path, payment_status = 'pending_verification', submitted_at = now(), updated_at = now()
  where order_id = target.id and payment_batch_id = p_attempt and payment_status = 'awaiting_proof';
  if not found then raise exception 'Layaway payment submission is unavailable.'; end if;
  select sum(merchandise_amount + shipping_amount + late_fee_amount) into total from public.order_payments where order_id = target.id and payment_batch_id = p_attempt;
  return total;
end;
$$;

revoke all on function public.attach_layaway_payment_proof(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.attach_layaway_payment_proof(uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
