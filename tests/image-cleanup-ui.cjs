// Run after building: PLAYWRIGHT_MODULE_PATH=/path/to/playwright CHROME_PATH=/path/to/chrome node tests/image-cleanup-ui.cjs
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const out=path.resolve(__dirname,'../out')
const server=http.createServer((req,res)=>{try{let file=path.join(out,new URL(req.url,'http://localhost').pathname);if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.wasm')?'application/wasm':'text/html');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end()}})
const id='02e25917-4fa4-4e77-b00a-f723ebd8afee',media='https://hydro-blasters-mnl.pages.dev/media/'
const first=`products/${id}/image-20260809-8dd88bac-repair-10937c211700.webp`,second=`products/${id}/image-20260809-12345678.webp`,replacement=`products/${id}/image-20260925-abcdef12.webp`
const initial={id,name:'Cleanup test',slug:'cleanup-test',category:'Accessories',price:100,stock:2,is_active:false,status:'draft',image_urls:[media+first,media+second],shipping_class:'Compact',has_variants:false}
;(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});try{
for(const scenario of ['replace','remove one','remove multiple','unchanged','cleanup failure']){
 let product=structuredClone(initial),patches=0,uploads=0,deleted=[];const context=await browser.newContext({viewport:{width:390,height:844}})
 await context.addInitScript(()=>localStorage.setItem('sb-jfzzpsjlgrgoxwtbtuqw-auth-token',JSON.stringify({access_token:'local-test',refresh_token:'local-test',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'11111111-1111-4111-8111-111111111111',app_metadata:{role:'admin'}}})))
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin===origin){
 if(url.pathname==='/api/admin/product-images'){
  if(req.method()==='POST'){uploads++;return route.fulfill({status:201,json:{publicUrl:media+replacement}})}
  assert(patches>0,'cleanup must follow saved DB row');const keys=req.postDataJSON().keys;for(const key of keys)assert(!product.image_urls.includes(media+key));deleted.push(...keys)
  return route.fulfill(scenario==='cleanup failure'?{status:502,json:{error:`Could not delete R2 image keys: ${first}`,failedKeys:[first]}}:{status:200,json:{deleted:keys.length}})
 }return route.continue()}
 if(url.hostname.endsWith('supabase.co')){if(url.pathname.endsWith('/products')){if(req.method()==='PATCH'){patches++;product={...product,...req.postDataJSON()};return route.fulfill({json:product})}return route.fulfill({json:url.searchParams.has('id')?product:[product]})}return route.fulfill({json:[]})}
 return route.fulfill({status:200,body:''})})
 const page=await context.newPage();await page.goto(`${origin}/admin/products/edit/?id=${id}`);await page.locator('#product-name').waitFor();assert.equal(await page.locator('img[alt^="Saved product image"]').count(),2)
 if(scenario!=='unchanged')await page.getByRole('button',{name:'Remove saved product image 1',exact:true}).click()
 if(scenario==='remove multiple')await page.getByRole('button',{name:'Remove saved product image 1',exact:true}).click()
 if(scenario==='replace'||scenario==='cleanup failure'){
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=4;c.height=4;c.getContext('2d').fillRect(0,0,4,4);return c.toDataURL().split(',')[1]})
  await page.locator('input[type=file]').last().setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')})
 }
 await page.getByRole('button',{name:'Save changes',exact:true}).click()
 if(scenario==='cleanup failure'){
  await page.getByRole('alert').filter({hasText:'Product saved successfully.'}).waitFor();assert((await page.getByRole('alert').filter({hasText:'Product saved successfully.'}).innerText()).includes(first));assert.equal(patches,1);assert.deepEqual(product.image_urls,[media+second,media+replacement]);assert.equal(await page.locator('img[alt^="Saved product image"]').count(),2);assert.equal(await page.locator('img[alt^="Selected product image"]').count(),0)
  // Saving again must not reupload or restore the deleted reference.
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForURL('**/admin/products?updated=1');assert.deepEqual(deleted,[first]);assert.deepEqual(product.image_urls,[media+second,media+replacement]);assert.equal(uploads,1)
 }else{await page.waitForURL('**/admin/products?updated=1');assert.deepEqual(deleted,scenario==='unchanged'?[]:scenario==='remove multiple'?[first,second]:[first]);assert.equal(uploads,scenario==='replace'?1:0)}
 assert.equal(await page.evaluate(()=>!!localStorage.getItem('hydro-products-updated')),true);console.log('PASS built form:',scenario);await context.close()
}
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exit(1)})
