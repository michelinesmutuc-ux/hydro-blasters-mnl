-- Rename only the former SQB category. No other product category is touched.
update public.products
set category = 'SQB Build Parts', updated_at = now()
where category = 'SQB Kits';
