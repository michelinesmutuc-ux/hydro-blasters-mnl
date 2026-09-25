# Isolated production regressions

Run from the repository root after installing the normal application dependencies:

```sh
pnpm --dir tests install --ignore-workspace --frozen-lockfile
node tests/appointment-notifications.mjs
node tests/order-notifications.mjs
node tests/cod-postgres.mjs
node scripts/generate-cod-migration.mjs --check
```

All appointments, orders and Telegram responses in these tests are synthetic and local.
No production writes or actual Telegram sends occur.

The PostgreSQL test uses PGlite with a structural fixture of the relevant production
columns and the production `create_guest_order` definition retrieved on September 22,
2026. It runs the actual function before and after the generated migration, including
historical idempotency replay, discounted merchandise, rounding boundaries and non-COD
methods. The fixture intentionally excludes production data, triggers and RLS; this is
not a full deployment integration test.

`fixtures/deployed-notify-appointment.txt` is the source returned by Supabase for
`notify-new-appointment` version 5. The regression reproduces its incorrect `orderId`
contract without network access. The corrected appointment handler and the unchanged
order handler are exercised with isolated database/API doubles.

`config/cod.json` is the authoritative rate. The migration is generated from it and
lint/build check that the SQL artifact still matches. Do not edit old migration files
or recalculate historical orders. No current rate is attached to historical receipts.
