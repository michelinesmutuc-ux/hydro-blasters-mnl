import { supabase } from './client'

export const publicProductColumns = 'id,name,slug,brand,category,price,stock,status,image_urls,featured,created_at,short_description'
export const adminProductColumns = 'id,name,slug,brand,category,price,stock,status,short_description,description,specifications,image_urls,featured,is_active,created_at'

export async function fetchActiveProducts(options: { featuredOnly?: boolean } = {}) {
  let query = supabase.from('products').select(publicProductColumns).eq('is_active', true)
  if (options.featuredOnly) query = query.eq('featured', true)
  return query.order('created_at', { ascending: false })
}

export async function fetchActiveProductBySlug(slug: string) {
  return supabase
    .from('products')
    .select('id,name,slug,brand,category,price,stock,status,short_description,description,image_urls')
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
    .select('id,name,slug,brand,category,price,stock,status,short_description,description,featured,is_active,image_urls')
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
