import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import ts from 'typescript'
import vm from 'node:vm'
const config = JSON.parse(readFileSync(new URL('../config/cod.json', import.meta.url)))
const scope = vm.createContext({ exports: {}, require: () => config })
vm.runInContext(ts.transpile(readFileSync(new URL('../lib/cod.ts', import.meta.url), 'utf8'), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }), scope)
assert.equal(scope.exports.codServiceFeeLabel, 'COD Service Fee (2%)')
const db = new PGlite()
await db.exec(readFileSync(new URL('./fixtures/schema.sql', import.meta.url), 'utf8'))
const definition = readFileSync(new URL('./fixtures/current-create-guest-order.sql', import.meta.url), 'utf8')
await db.exec(definition)
const productId = randomUUID()
await db.query('insert into products(id,name,price,stock,is_active,has_variants,is_clearance,shipping_class) values ($1, $2, 1000, 100, true, false, false, $3)', [productId,'TEST ONLY','Compact'])
const payload = () => ({ first_name:'Test',last_name:'Only',mobile_number:'09000000000',idempotency_key:randomUUID(),delivery_method:'nationwide_delivery',payment_method:'cash_on_delivery',house_unit:'Test',street:'Test',barangay:'Test',city_municipality:'Test',region:'Test',postal_code:'0000',items:[{product_id:productId,quantity:1}] })
const create = async p => (await db.query('select * from public.create_guest_order($1::jsonb)', [JSON.stringify(p)])).rows[0]
const oldPayload = payload()
const old = await create(oldPayload)
assert.equal(Number(old.cod_service_fee),10)
const migration=readFileSync(new URL('../supabase/migrations/20260922045754_cod_service_fee_two_percent.sql',import.meta.url),'utf8')
await db.exec(migration)
const changed = (await db.query("select pg_get_functiondef('public.create_guest_order(jsonb)'::regprocedure) as definition")).rows[0].definition
assert.equal(changed.trimEnd(), definition.trimEnd().replace('cod_fee := ceil((subtotal-discount)*.01)', 'cod_fee := ceil((subtotal-discount)*2/100)'))
await db.exec(migration) // safe no-op repeat
assert.deepEqual(await create(oldPayload),old,'idempotent historical order keeps recorded totals')
const results=[]
for (const subtotal of [0.01,49.99,50,50.01,999.99,1000,1234.56,10000]) {
  await db.query('update products set price=$1 where id=$2',[subtotal,productId])
  const order=await create(payload());const fee=Number(order.cod_service_fee)
  assert.equal(fee,scope.exports.calculateCodServiceFee(subtotal))
  assert.equal(Number(order.rider_collectible_amount),subtotal)
  assert.equal(Number(order.upfront_amount),99+fee)
  assert.equal(Number(order.overall_total),Number((subtotal+99+fee).toFixed(2)))
  results.push({subtotal,fee,upfront:Number(order.upfront_amount),total:Number(order.overall_total)})
}
for(const method of ['gcash','bank_transfer','pay_upon_pickup']) {
  const p=payload(); p.payment_method=method;if(method==='pay_upon_pickup')p.delivery_method='showroom_pickup'
  assert.equal(Number((await create(p)).cod_service_fee),0)
}
await db.query('update products set price=1000 where id=$1',[productId])
const session=randomUUID()
await db.exec("insert into launch_promo(id,name,active,claimed_redemptions,discount_percent,maximum_discount) values(true,'TEST',true,0,0.1,500)")
await db.query("insert into launch_promo_reservations(checkout_session_id,status,expires_at) values($1,'reserved',now()+interval '1 hour')",[session])
const discounted=await create({...payload(),checkout_session_id:session})
assert.equal(Number(discounted.promo_discount),100)
assert.equal(Number(discounted.cod_service_fee),18)
assert.equal(Number(discounted.overall_total),1017)
assert.equal((await db.query('select cod_service_fee from orders where id=$1',[old.order_id])).rows[0].cod_service_fee,'10')
console.log('PASS: real PostgreSQL create_guest_order: historical/idempotency, 8 amounts, 3 non-COD methods, discounted basis, exact body preservation, repeat migration.')
console.table(results)
await db.close()
