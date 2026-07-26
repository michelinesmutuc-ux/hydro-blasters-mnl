create or replace function public.prevent_product_slug_update()
returns trigger
language plpgsql
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'Product slugs are permanent and cannot be changed after creation.';
  end if;

  return new;
end;
$$;

drop trigger if exists products_slug_is_immutable on public.products;

create trigger products_slug_is_immutable
before update of slug on public.products
for each row
execute function public.prevent_product_slug_update();
