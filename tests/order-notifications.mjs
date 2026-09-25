import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const root = new URL('../', import.meta.url)
const source = readFileSync(new URL('supabase/functions/notify-new-order/index.ts',root),'utf8')
for (const photoFails of [false,true]) {
 const order={id:'test-order',order_reference:'TEST',customer_name:'Test',mobile_number:'09000000000',delivery_method:'nationwide_delivery',payment_method:'cash_on_delivery',merchandise_subtotal:1000,shipping_fee:99,cod_service_fee:20,upfront_amount:119,rider_collectible_amount:1000,showroom_payable_amount:0,overall_total:1119,payment_proof_path:'test-proof',payment_status:'pending_verification',order_status:'pending',telegram_notification_status:'pending',telegram_notification_attempted_at:null}
 const calls=[]
 const client={ storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://test.invalid/proof'}})})}, from(table){
  let updates
  const q={select(){return this},eq(){return this},is(){return this},in(){return this},update(value){updates=value;return this},single(){return this.run()},maybeSingle(){return this.run()},then(resolve,reject){return this.run().then(resolve,reject)},async run(){
   if(table==='orders'){if(updates)Object.assign(order,updates);return{data:{...order}}}
   if(table==='order_items')return{data:[{product_id:'test',product_name:'Test',quantity:1,line_total:1000}]}
   if(table==='products')return{data:[{id:'test',brand:'Test'}]}
   throw new Error(table)
  }};return q
 }}
 let handler
 const context=vm.createContext({Response,Request,console:{info(){},error(){}},createClient:()=>client,Deno:{env:{get:key=>key==='SUPABASE_URL'?'https://test.supabase.co':'test'},serve:value=>handler=value},fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify({ok:!photoFails||!url.endsWith('sendPhoto')}),{status:photoFails&&url.endsWith('sendPhoto')?400:200})}})
 vm.runInContext(ts.transpile(source.replace(/^import .*\n/gm,''),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}),context)
 const response=await handler(new Request('https://test/notify',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({orderId:'test-order'})}))
 assert.equal(response.status,201)
 assert.equal(order.telegram_notification_status,'sent')
 assert.equal(order.telegram_notification_type,photoFails?'text-fallback':'photo')
 assert.ok(calls.some(call=>JSON.stringify(call.body).includes('₱20.00')))
 assert.ok(calls.some(call=>JSON.stringify(call.body).includes('₱1,119.00')))
}
console.log('PASS: unchanged order notifier sends stored COD totals via photo and text fallback.')
// Reproduce the production appointment deployment mismatch, without any network.
const deployed = new URL('./fixtures/deployed-notify-appointment.txt', import.meta.url)
let handler;let requests=0
const context=vm.createContext({Request,Response,console,createClient:()=>({}),Deno:{env:{get:()=> 'test'},serve:value=>handler=value},fetch:async()=>{requests++;throw new Error('Unexpected outbound request')}})
vm.runInContext(ts.transpile(readFileSync(deployed,'utf8').replace(/^import .*\n/gm,''),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}),context)
const response=await handler(new Request('https://test/notify',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({appointmentId:'test'})}))
assert.equal(response.status,400)
assert.equal((await response.json()).error,'Order ID is required.')
assert.equal(requests,0)
console.log('PASS: deployed appointment function reproducibly returns 400 before any Telegram request.')
