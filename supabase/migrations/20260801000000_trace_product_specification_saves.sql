-- Temporary save-attempt tracing for product specification diagnostics.
-- This lets one browser save attempt be correlated with the later static build
-- and the browser-rendered product page without recording any credentials.

alter table public.product_specifications
  add column if not exists save_attempt_id uuid;

create index if not exists product_specifications_save_attempt_id_idx
  on public.product_specifications (save_attempt_id);
