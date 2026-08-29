-- Apply only after the /media/* Pages Function and PRODUCT_IMAGES_R2 binding are live
-- and every active image has been verified through the new endpoint.
-- This changes only the delivery origin. The complete existing R2 object key is preserved.

do $$
declare
  old_prefix constant text := 'https://pub-fbd9108fe1ba4469a1ac5c6bb8204840.r2.dev/';
  new_prefix constant text := 'https://hydro-blasters-mnl.pages.dev/media/';
  invalid_product_urls integer;
  invalid_variant_urls integer;
begin
  select count(*) into invalid_product_urls
  from public.products p
  cross join lateral unnest(coalesce(p.image_urls, '{}'::text[])) as image_url
  where p.is_active = true
    and image_url like old_prefix || 'products/%'
    and image_url !~ '^https://pub-fbd9108fe1ba4469a1ac5c6bb8204840[.]r2[.]dev/products/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/image-[0-9]{8}-[0-9a-f]{8}(-repair-[0-9a-f]{12})?[.]webp$';

  select count(*) into invalid_variant_urls
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where p.is_active = true
    and v.image_url like old_prefix || 'products/%'
    and v.image_url !~ '^https://pub-fbd9108fe1ba4469a1ac5c6bb8204840[.]r2[.]dev/products/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/image-[0-9]{8}-[0-9a-f]{8}(-repair-[0-9a-f]{12})?[.]webp$';

  if invalid_product_urls > 0 or invalid_variant_urls > 0 then
    raise exception 'Image URL migration stopped: % product URLs and % variant URLs are outside the verified versioned WebP format.', invalid_product_urls, invalid_variant_urls;
  end if;

  update public.products p
  set image_urls = (
    select array_agg(
      case when image_url like old_prefix || 'products/%'
        then new_prefix || substr(image_url, char_length(old_prefix) + 1)
        else image_url
      end
      order by ordinal
    )
    from unnest(p.image_urls) with ordinality as images(image_url, ordinal)
  )
  where p.is_active = true
    and exists (
      select 1 from unnest(p.image_urls) as image_url
      where image_url like old_prefix || 'products/%'
    );

  update public.product_variants v
  set image_url = new_prefix || substr(v.image_url, char_length(old_prefix) + 1)
  from public.products p
  where p.id = v.product_id
    and p.is_active = true
    and v.image_url like old_prefix || 'products/%';
end;
$$;
