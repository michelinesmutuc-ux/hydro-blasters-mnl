const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const cache = new Map()
function load(file) {
  file = path.resolve(root, file)
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)((name) => {
    if (name === '../admin/auth') return {requireAdminSession: async () => ({access_token:'test-admin'})}
    return load(path.resolve(path.dirname(file), name + '.ts'))
  }, module, module.exports)
  return module.exports
}
const {isCleanupKey,cleanupKeyFromUrl,planImageCleanup}=load('lib/images/cleanup.ts')
const {onRequestDelete}=load('functions/api/admin/product-images.ts')
const {deleteProductImages}=load('lib/supabase/product-images.ts')
const id='02e25917-4fa4-4e77-b00a-f723ebd8afee'
const repaired=`products/${id}/image-20260809-8dd88bac-repair-10937c211700.webp`
const old=`products/${id}/image-20260809-8dd88bac.webp`
const next=`products/${id}/image-20260925-12345678.webp`
const r2='https://pub-fbd9108fe1ba4469a1ac5c6bb8204840.r2.dev/'
const media='https://hydro-blasters-mnl.pages.dev/media/'
let products=[],variants=[],deleted=[],failKey=null,failRead=false,role='admin',calls=[]
const env={NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test',PRODUCT_IMAGES_R2:{delete:async key=>{assert.equal(typeof key,'string');if(key===failKey)throw new Error('Injected R2 failure');deleted.push(key)}}}
const apiFetch=async(url,options)=>{
  calls.push(String(url))
  if(String(url).endsWith('/auth/v1/user'))return Response.json({app_metadata:{role}})
  assert.equal(options.headers.authorization,'Bearer test-admin')
  if(failRead)return new Response('',{status:503})
  const parsed=new URL(url);const rows=parsed.pathname.endsWith('/products')?products:variants
  // Simulate a server limit lower than requested; the endpoint must continue paging.
  return Response.json(rows.slice(Number(parsed.searchParams.get('offset')),Number(parsed.searchParams.get('offset'))+1))
}
async function invoke(keys) { return onRequestDelete({request:new Request('https://site.test/api/admin/product-images',{method:'DELETE',headers:{authorization:'Bearer test-admin','content-type':'application/json'},body:JSON.stringify({keys})}),env}) }
function reset(){products=[];variants=[];deleted=[];failKey=null;failRead=false;role='admin';calls=[];global.fetch=apiFetch}
(async()=>{
  assert(isCleanupKey(repaired));assert(!/^products\/[0-9a-f-]{36}\/image-[0-9]{8}-[0-9a-f]{8}\.(?:jpg|png|webp)$/i.test(repaired),'reproduce old validator mismatch')
  for(const prefix of [r2,media])assert.equal(cleanupKeyFromUrl(prefix+repaired),repaired)
  assert.equal(cleanupKeyFromUrl(media+repaired+'?retry=1'),repaired)
  assert.equal(cleanupKeyFromUrl(media+repaired.replace('image','%69mage')),repaired)
  for(const value of [null,undefined,'',media+repaired.replace('image','%2569mage'),media+'bad%ZZ', 'https://evil.test/'+repaired,media+repaired+'?unknown=1',media+old.replace('image-','image space-'),media+old.replace('image-','image+-')])assert.equal(cleanupKeyFromUrl(value),null)
  for(const ext of ['jpg','png'])assert(isCleanupKey(old.replace('webp',ext)))
  assert.deepEqual(planImageCleanup([media+repaired,r2+repaired,null,''],[r2+repaired]),{keys:[],skipped:[]})
  assert.deepEqual(planImageCleanup([media+repaired,r2+repaired],[media+next]).keys,[repaired])
  reset();let response=await invoke([repaired,old]);assert.equal(response.status,200);assert.deepEqual(deleted,[repaired,old])
  reset();products=[{id:'a',image_urls:[media+repaired]},{id:'b',image_urls:[r2+old+'?cache=1']}];variants=[{id:'v',image_url:media+next}];response=await invoke([repaired,old,next]);assert.equal(response.status,200);assert.deepEqual(deleted,[]);assert(calls.some(u=>u.includes('offset=2')))
  reset();response=await invoke([repaired,repaired]);assert.deepEqual(deleted,[repaired])
  for(const key of [media+repaired,'/'+repaired,repaired.replace('products/','other/'),null,'',old.replace('image','image space')]){reset();response=await invoke([key]);assert.equal(response.status,400);assert.deepEqual(deleted,[]);assert((await response.json()).invalidKeys.length)}
  reset();failRead=true;response=await invoke([repaired]);assert.equal(response.status,503);assert.deepEqual(deleted,[])
  reset();products=[{id}];response=await invoke([repaired]);assert.equal(response.status,503);assert.deepEqual(deleted,[])
  reset();role='customer';response=await invoke([repaired]);assert.equal(response.status,403);assert.deepEqual(deleted,[])
  reset();failKey=repaired;response=await invoke([repaired,old]);const result=await response.json();assert.equal(response.status,502);assert.deepEqual(result.failedKeys,[repaired]);assert.deepEqual(result.deletedKeys,[old]);assert(result.error.includes(repaired))
  // Exercise the actual frontend helper -> actual endpoint -> fake R2 for each user workflow.
  for(const [label,previous,retained,expected] of [
    ['replace',[media+repaired],[media+next],[repaired]],
    ['remove one',[media+repaired,media+old],[media+old],[repaired]],
    ['remove multiple',[media+repaired,media+old],[],[repaired,old]],
    ['unchanged',[media+repaired,media+old],[media+repaired,media+old],[]],
    ['variant reuse',[media+repaired],[r2+repaired],[]],
  ]){
    reset();products=[{id,image_urls:retained}];let requests=0
    global.fetch=async(url,options)=>{if(url==='/api/admin/product-images'){requests++;return invoke(JSON.parse(options.body).keys)}return apiFetch(url,options)}
    await deleteProductImages(previous,retained);assert.deepEqual(deleted,expected,label);assert.equal(requests,expected.length?1:0);console.log('PASS',label)
  }
  reset();let requests=0;global.fetch=async()=>{requests++;throw new Error('Network down')}
  await assert.rejects(deleteProductImages([media+repaired]),e=>e.message.includes(repaired)&&e.message.includes('Network down'));assert.equal(requests,1)
  reset();global.fetch=async()=>{throw new Error('Should not call storage')};await assert.rejects(deleteProductImages(['https://legacy.test/photo with spaces.png']),/left untouched/)
  console.log('PASS key normalization, repair regression, legacy types, pagination, retained/shared references, invalid inputs, authorization, partial failure and diagnostics')
})().catch(error=>{console.error(error);process.exitCode=1})
