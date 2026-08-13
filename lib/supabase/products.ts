import { supabase } from './client'
import { normalizeProductCategory } from '../products/category-order'

export const publicProductColumns = 'id,name,slug,brand,category,product_type,price,stock,status,image_urls,shipping_class,is_clearance,is_best_seller,has_variants,variant_group_name,featured,show_on_homepage,highlight_type,homepage_sort_order,created_at,short_description'
export const adminProductColumns = 'id,name,slug,brand,category,product_type,price,stock,status,shipping_class,is_clearance,is_best_seller,has_variants,variant_group_name,short_description,description,specifications,image_urls,featured,is_active,show_on_homepage,highlight_type,homepage_sort_order,created_at,updated_at'

export async function fetchActiveProducts(options: { featuredOnly?: boolean; homepageOnly?: boolean } = {}) {
  let query = supabase.from('products').select(publicProductColumns).eq('is_active', true)
  if (options.homepageOnly) {
    const { data, error } = await query.eq('show_on_homepage', true).order('homepage_sort_order', { ascending: true, nullsFirst: false }).order('name', { ascending: true })
    return { data: data?.map((product) => ({ ...product, category: normalizeProductCategory(product.category) })), error }
  }
  if (options.featuredOnly) query = query.eq('featured', true)
  const { data, error } = await query.order('created_at', { ascending: false })
  return { data: data?.map((product) => ({ ...product, category: normalizeProductCategory(product.category) })), error }
}

export async function fetchActiveProductsBySlugs(slugs: string[]) {
  if (slugs.length === 0) return { data: [], error: null }
  const { data, error } = await supabase.from('products').select(publicProductColumns).eq('is_active', true).in('slug', slugs)
  return { data: data?.map((product) => ({ ...product, category: normalizeProductCategory(product.category) })), error }
}

export async function fetchActiveProductBySlug(slug: string) {
  const { data, error } = await supabase
    .from('products')
    .select('id,name,slug,brand,category,product_type,price,stock,status,short_description,description,image_urls,shipping_class,is_clearance,is_best_seller,has_variants,variant_group_name')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  return { data: data ? { ...data, category: normalizeProductCategory(data.category) } : data, error }
}

export async function fetchAdminProducts() {
  const { data, error } = await supabase.from('products').select(adminProductColumns).order('created_at', { ascending: false })
  return { data: data?.map((product) => ({ ...product, category: normalizeProductCategory(product.category) })), error }
}

export async function fetchAdminProduct(productId: string) {
  const { data, error } = await supabase
    .from('products')
    .select('id,name,slug,brand,category,product_type,price,stock,status,shipping_class,is_clearance,is_best_seller,has_variants,variant_group_name,short_description,description,featured,is_active,show_on_homepage,highlight_type,homepage_sort_order,image_urls')
    .eq('id', productId)
    .single()
  return { data: data ? { ...data, category: normalizeProductCategory(data.category) } : data, error }
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
