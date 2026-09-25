import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
function runtime({ telegramStatus = 200, telegramBody = { ok: true }, failInvoke = false, failWrite = false, missingConfig = false, unreachable = false } = {}) {
  const rows = []; const calls = []; const logs = []
  const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service', TELEGRAM_BOT_TOKEN: 'test-bot', TELEGRAM_CHAT_ID: 'test-chat' }
  if (missingConfig) delete env.TELEGRAM_BOT_TOKEN
  const admin = { from(table) {
    assert.equal(table, 'showroom_appointments')
    let updates; let insert; const filters = []
    const query = {
      select() { return this }, insert(value) { insert = value; return this }, update(value) { updates = value; return this },
      eq(key, value) { filters.push(row => row[key] === value); return this }, is(key, value) { filters.push(row => (row[key] ?? null) === value); return this },
      single() { return this.run() }, maybeSingle() { return this.run() }, then(resolve, reject) { return this.run().then(resolve, reject) },
      async run() {
        if (insert) { const row = { id: `appointment-${rows.length}`, ...insert }; rows.push(row); return { data: { ...row }, error: null } }
        const row = rows.find(row => filters.every(filter => filter(row)))
        if (updates && failWrite) throw new Error('simulated persistence failure')
        if (row && updates) Object.assign(row, updates)
        return { data: row ? { ...row } : null, error: null }
      }
    }; return query
  } }
  let notify
  const context = vm.createContext({ Response, Request, AbortSignal, console: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) }, createClient: () => admin,
    Deno: { env: { get: name => env[name] }, serve: handler => { context.handler = handler } },
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) })
      if (url.includes('api.telegram.org') && unreachable) throw new Error('simulated timeout')
      if (url.includes('api.telegram.org')) return new Response(JSON.stringify(telegramBody), { status: telegramStatus })
      if (failInvoke) return new Response('{"error":"Order ID is required."}', { status: 400 })
      return notify(new Request(url, options))
    }
  })
  const evaluate = source => vm.runInContext(ts.transpile(source.replace(/^import .*\n/gm, '').replace(/export /g, ''), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
  evaluate(read('supabase/functions/_shared/telegram.ts'))
  evaluate(read('supabase/functions/notify-new-appointment/index.ts')); notify = context.handler
  // Separate scope because both entrypoints define a response helper.
  evaluate(`{\n${read('supabase/functions/create-showroom-appointment/index.ts').replace(/^import .*\n/gm, '')}\n}`)
  return { rows, calls, logs, submit: body => context.handler(new Request('https://test/create', { method: 'POST', body: JSON.stringify(body) })), notify: id => notify(new Request('https://test/notify', { method: 'POST', headers: { Authorization: 'Bearer test-service' }, body: JSON.stringify({ appointmentId: id }) })) }
}
const valid = { customer_name: 'A <B> & C', mobile_number: '09000000000', preferred_date: '2026-10-01', preferred_time: '10:00', products_of_interest: 'Product <test>', agreement: true }
let count = 0
for (const options of [{}, { unreachable: true }, { telegramStatus: 400, telegramBody: { ok: false, error_code: 400 } }, { telegramBody: { ok: false, error_code: 429 } }, { failInvoke: true }, { missingConfig: true }, { failInvoke: true, failWrite: true }]) {
  const r = runtime(options)
  assert.equal((await r.submit(valid)).status, 201, 'persisted appointments always succeed')
  assert.equal(r.rows.length, 1)
  if (!Object.keys(options).length) {
    assert.ok(r.rows[0].admin_notification_sent_at)
    const telegram = r.calls.find(call => call.url.includes('api.telegram.org'))
    assert.match(telegram.body.text, /A &lt;B&gt; &amp; C/)
    assert.match(telegram.body.text, /None/)
    await r.notify(r.rows[0].id)
    assert.equal(r.calls.filter(call => call.url.includes('api.telegram.org')).length, 1)
  } else if (!options.failWrite) { assert.ok(r.rows[0].admin_notification_error); assert.ok(r.logs.length) }
  count++
}
const r = runtime()
assert.equal((await r.submit({ ...valid, agreement: false })).status, 400)
assert.equal(r.rows.length, 0)
console.log(`PASS: ${count + 1} appointment scenarios (HTTP success, escaping, missing optional notes, duplicate, API failure, invocation mismatch, missing config, failed error write, validation).`)
