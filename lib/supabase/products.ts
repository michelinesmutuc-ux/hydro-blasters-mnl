import { supabase } from './client'

export const publicProductColumns = 'id,name,slug,brand,category,product_type,price,stock,status,image_urls,shipping_classification,has_variants,variant_group_name,featured,show_on_homepage,highlight_type,homepage_sort_order,created_at,short_description'
export const adminProductColumns = 'id,name,slug,brand,category,product_type,price,stock,status,shipping_classification,has_variants,variant_group_name,short_description,description,specifications,image_urls,featured,is_active,show_on_homepage,highlight_type,homepage_sort_order,created_at'

export async function fetchActiveProducts(options: { featuredOnly?: boolean; homepageOnly?: boolean } = {}) {
  let query = supabase.from('products').select(publicProductColumns).eq('is_active', true)
  if (options.homepageOnly) return query.eq('show_on_homepage', true).order('homepage_sort_order', { ascending: true, nullsFirst: false }).order('name', { ascending: true })
  if (options.featuredOnly) query = query.eq('featured', true)
  return query.order('created_at', { ascending: false })
}

export async function fetchActiveProductsBySlugs(slugs: string[]) {
  if (slugs.length === 0) return { data: [], error: null }
  return supabase.from('products').select(publicProductColumns).eq('is_active', true).in('slug', slugs)
}

export async function fetchActiveProductBySlug(slug: string) {
  return supabase
    .from('products')
    .select('id,name,slug,brand,category,product_type,price,stock,status,short_description,description,image_urls,has_variants,variant_group_name')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
}

export async function fetchAdminProducts() {
  return supabase.from('products').select(adminProductColumns).order('created_at', { ascending: false })
}

export async function fetchAdminProduct(productId: string) {
  return supabase
    .from('products')
    .select('id,name,slug,brand,category,product_type,price,stock,status,shipping_classification,has_variants,variant_group_name,short_description,description,featured,is_active,show_on_homepage,highlight_type,homepage_sort_order,image_urls')
    .eq('id', productId)
    .single()
}

export async function findAvailableProductSlug(baseSlug: string) {
  let candidate = baseSlug
  let suffix = 2
  while (true) {
    const { data, error } = await supabase.from('products').select('id').eq('slug', candidate).limit(1)
    if (error) throw error
    if (!data?.length) return candidate
    candidate = `${baseSlug}-${suffix}`
    suffix += 1
  }
}
