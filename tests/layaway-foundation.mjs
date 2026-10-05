import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const db = new PGlite()
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`)
await db.exec(readFileSync(new URL('./fixtures/schema.sql', import.meta.url), 'utf8'))
await db.exec('alter table public.orders add primary key (id)')
try {
  await db.exec(readFileSync(new URL('../supabase/migrations/20261004000000_add_layaway_payment_foundation.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../supabase/migrations/20261004010000_fix_layaway_payment_proof_path.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../supabase/migrations/20261004020000_cancel_overdue_final_layaway_installment.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../supabase/migrations/20261004030000_guard_layaway_ledger_verification.sql', import.meta.url), 'utf8'))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const hash = 'a'.repeat(64)
await db.exec(`create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"role":"authenticated","app_metadata":{"role":"admin"}}'::jsonb $$;
  select set_config('request.jwt.claim.role', 'authenticated', false);`)
async function createLayaway(regular = 7500, shipping = 179) {
  const id = randomUUID()
  await db.query(`insert into orders(id,order_reference,idempotency_key,customer_name,mobile_number,delivery_method,payment_method,merchandise_subtotal,shipping_fee,cod_service_fee,upfront_amount,rider_collectible_amount,showroom_payable_amount,overall_total,payment_status,order_status)
    values($1,$2,$3,'Layaway Test','09000000000','nationwide_delivery','layaway',$4,$5,0,0,0,0,0,'pending_verification','pending')`, [id, `HBMNL-TEST-${id.slice(0, 6).toUpperCase()}`, randomUUID(), regular, shipping])
  const initialized = (await db.query('select * from initialize_layaway_order($1,$2,now())', [id, hash])).rows[0]
  return { id, initialized }
}

const first = await createLayaway()
assert.equal(Number(first.initialized.layaway_price), 8000)
assert.equal(Number(first.initialized.down_payment), 2400)
let rows = (await db.query('select * from order_payments where order_id=$1 order by installment_number nulls first', [first.id])).rows
assert.equal(rows.length, 1)
assert.equal(Number(rows[0].amount_due), 2400)
await assert.rejects(() => createLayaway(4499), /₱4,500 or more/)

const dpAttempt = randomUUID()
await db.query('select * from prepare_layaway_payment($1,$2,false)', [first.id, dpAttempt])
const firstReference = (await db.query('select order_reference from orders where id=$1', [first.id])).rows[0].order_reference
await db.query('select attach_layaway_payment_proof($1,$2,$3)', [first.id, dpAttempt, `orders/${firstReference}/layaway/${dpAttempt}.png`])
assert.equal((await db.query(`select payment_status from order_payments where order_id=$1 and payment_kind='down_payment'`, [first.id])).rows[0].payment_status, 'pending_verification')
await db.query(`update order_payments set payment_status='verified', amount_paid=amount_due, verified_at='2026-10-04T08:00:00+08' where order_id=$1 and payment_kind='down_payment'`, [first.id])
rows = (await db.query('select payment_kind,installment_number,merchandise_amount,shipping_amount,amount_due,due_date,payment_status from order_payments where order_id=$1 order by installment_number nulls first', [first.id])).rows
assert.deepEqual(rows.map((row) => Number(row.merchandise_amount)), [2400, 1866.67, 1866.67, 1866.66])
assert.equal(Number(rows[3].shipping_amount), 179)
assert.equal(Number(rows[1].merchandise_amount) + Number(rows[2].merchandise_amount) + Number(rows[3].merchandise_amount), 5600)
assert.equal(new Date(rows[1].due_date).toISOString().slice(0, 10), '2026-11-04')
assert.equal(new Date(rows[3].due_date).toISOString().slice(0, 10), '2027-01-04')

await db.query(`update order_payments set due_date=current_date-2, payment_status='due' where order_id=$1 and installment_number=1`, [first.id])
await db.query(`update order_payments set due_date=current_date, payment_status='due' where order_id=$1 and installment_number=2`, [first.id])
const dueAttempt = randomUUID()
const due = (await db.query('select * from prepare_layaway_payment($1,$2,false)', [first.id, dueAttempt])).rows[0]
assert.equal(Number(due.total_due), 3826.67)
rows = (await db.query('select installment_number,late_fee_amount,payment_status from order_payments where order_id=$1 and installment_number in (1,2) order by installment_number', [first.id])).rows
assert.deepEqual(rows.map((row) => Number(row.late_fee_amount)), [93.33, 0])
assert.deepEqual(rows.map((row) => row.payment_status), ['awaiting_proof', 'awaiting_proof'])

const second = await createLayaway()
await db.query(`update order_payments set payment_status='verified', amount_paid=amount_due, verified_at='2026-10-04T08:00:00+08' where order_id=$1`, [second.id])
const early = (await db.query('select * from prepare_layaway_payment($1,$2,true)', [second.id, randomUUID()])).rows[0]
assert.equal(Number(early.total_due), 5779)

const late = await createLayaway()
await db.query(`update order_payments set payment_status='verified', amount_paid=amount_due, verified_at='2026-10-04T08:00:00+08' where order_id=$1`, [late.id])
await db.query(`update order_payments set due_date=current_date-8, payment_status='due' where order_id=$1 and installment_number=1`, [late.id])
const lateDue = (await db.query('select * from prepare_layaway_payment($1,$2,false)', [late.id, randomUUID()])).rows[0]
assert.equal(Number(lateDue.total_due), 2053.34)

const finalLate = await createLayaway()
await db.query(`update order_payments set payment_status='verified', amount_paid=amount_due, verified_at='2026-10-04T08:00:00+08' where order_id=$1 and payment_kind='down_payment'`, [finalLate.id])
await db.query(`update order_payments set payment_status='verified', amount_paid=amount_due where order_id=$1 and installment_number in (1,2)`, [finalLate.id])
await db.query(`update order_payments set due_date=current_date-2, payment_status='due' where order_id=$1 and installment_number=3`, [finalLate.id])
const finalFivePercent = (await db.query('select * from prepare_layaway_payment($1,$2,false)', [finalLate.id, randomUUID()])).rows[0]
assert.equal(Number(finalFivePercent.total_due), 2138.99)

const finalMonth = await createLayaway()
await db.query(`update order_payments set payment_status='verified', amount_paid=amount_due, verified_at='2026-10-04T08:00:00+08' where order_id=$1 and payment_kind='down_payment'`, [finalMonth.id])
await db.query(`update order_payments set payment_status='verified', amount_paid=amount_due where order_id=$1 and installment_number in (1,2)`, [finalMonth.id])
await db.query(`update order_payments set due_date=current_date - interval '1 month' + interval '1 day', payment_status='due' where order_id=$1 and installment_number=3`, [finalMonth.id])
assert.notEqual((await db.query('select refresh_layaway_status($1)', [finalMonth.id])).rows[0].refresh_layaway_status, 'cancelled')
await db.query(`update order_payments set due_date=current_date - interval '1 month', payment_status='due' where order_id=$1 and installment_number=3`, [finalMonth.id])
assert.equal((await db.query('select refresh_layaway_status($1)', [finalMonth.id])).rows[0].refresh_layaway_status, 'cancelled')

const third = await createLayaway()
await db.query(`update order_payments set payment_status='verified', amount_paid=amount_due, verified_at='2026-10-04T08:00:00+08' where order_id=$1`, [third.id])
await db.query(`update order_payments set due_date=current_date-8, payment_status='due' where order_id=$1 and installment_number in (1,2)`, [third.id])
const cancelled = (await db.query('select * from prepare_layaway_payment($1,$2,false)', [third.id, randomUUID()])).rows[0]
assert.equal(cancelled.payment_batch_id, null)
assert.equal((await db.query('select layaway_status,order_status from orders where id=$1', [third.id])).rows[0].layaway_status, 'cancelled')

const fourth = await createLayaway()
await assert.rejects(() => db.query(`update orders set order_status='shipped' where id=$1`, [fourth.id]), /cannot be released/)
const normal = randomUUID()
await db.query(`insert into orders(id,order_reference,idempotency_key,customer_name,mobile_number,delivery_method,payment_method,merchandise_subtotal,shipping_fee,cod_service_fee,upfront_amount,rider_collectible_amount,showroom_payable_amount,overall_total,payment_status,order_status)
 values($1,'HBMNL-NORMAL',$2,'Normal','09000000000','nationwide_delivery','gcash',100,99,0,199,0,0,199,'verified','pending')`, [normal, randomUUID()])
await db.query(`update orders set order_status='shipped' where id=$1`, [normal])

const lifecycle = await createLayaway(5500)
const lifecycleReference = (await db.query('select order_reference from orders where id=$1', [lifecycle.id])).rows[0].order_reference
const lifecycleDpAttempt = randomUUID()
await db.query('select * from prepare_layaway_payment($1,$2,false)', [lifecycle.id, lifecycleDpAttempt])
await db.query('select attach_layaway_payment_proof($1,$2,$3)', [lifecycle.id, lifecycleDpAttempt, `orders/${lifecycleReference}/layaway/${lifecycleDpAttempt}.png`])
let lifecycleRows = (await db.query(`select payment_kind,installment_number,amount_due,amount_paid,due_date,payment_status,submitted_at,verified_at from order_payments where order_id=$1 order by installment_number nulls first`, [lifecycle.id])).rows
assert.equal(lifecycleRows[0].payment_status, 'pending_verification')
assert.equal(Number(lifecycleRows[0].amount_paid), 0)
await assert.rejects(() => db.query(`update orders set payment_status='verified' where id=$1`, [lifecycle.id]), /Verify Layaway payment transactions/)
await db.query('select verify_layaway_payment_batch($1,$2,true)', [lifecycle.id, lifecycleDpAttempt])
lifecycleRows = (await db.query(`select payment_kind,installment_number,merchandise_amount,amount_paid,due_date,payment_status,submitted_at,verified_at from order_payments where order_id=$1 order by installment_number nulls first`, [lifecycle.id])).rows
assert.equal(lifecycleRows.length, 4)
assert.equal(lifecycleRows[0].payment_status, 'verified')
assert.equal(Number(lifecycleRows[0].amount_paid), 1800)
assert.ok(lifecycleRows[0].verified_at)
assert.deepEqual(lifecycleRows.slice(1).map((row) => Number(row.merchandise_amount)), [1400, 1400, 1400])
assert.equal(lifecycleRows.slice(1).reduce((total, row) => total + Number(row.merchandise_amount), 0), 4200)
assert.ok(lifecycleRows[1].due_date)
assert.equal(Number(lifecycleRows.find((row) => row.installment_number === 1)?.merchandise_amount), 1400)
assert.ok(new Date(lifecycleRows.find((row) => row.installment_number === 1)?.due_date).getTime() > Date.now())
assert.equal((await db.query('select layaway_status from orders where id=$1', [lifecycle.id])).rows[0].layaway_status, 'active')
await db.query(`update order_payments set due_date=current_date, payment_status='due' where order_id=$1 and installment_number=1`, [lifecycle.id])
const installmentAttempt = randomUUID()
await db.query('select * from prepare_layaway_payment($1,$2,false)', [lifecycle.id, installmentAttempt])
await db.query('select attach_layaway_payment_proof($1,$2,$3)', [lifecycle.id, installmentAttempt, `orders/${lifecycleReference}/layaway/${installmentAttempt}.png`])
assert.equal((await db.query(`select payment_status from order_payments where order_id=$1 and installment_number=1`, [lifecycle.id])).rows[0].payment_status, 'pending_verification')
await db.query('select verify_layaway_payment_batch($1,$2,true)', [lifecycle.id, installmentAttempt])
lifecycleRows = (await db.query(`select installment_number,amount_paid,payment_status from order_payments where order_id=$1 order by installment_number nulls first`, [lifecycle.id])).rows
assert.equal(lifecycleRows[1].payment_status, 'verified')
assert.equal(Number(lifecycleRows[0].amount_paid) + Number(lifecycleRows[1].amount_paid), 3200)

console.log('PASS: layaway foundation: price/DP/installment rounding, verified-payment lifecycle, individual ledger verification, late fees, combined due payments, early payoff, cancellation, and fulfillment guard.')
await db.close()
