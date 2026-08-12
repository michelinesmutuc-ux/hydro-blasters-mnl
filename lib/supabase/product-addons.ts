import { supabase } from './client'

export type ProductAddon = {
  id: string
  name: string
  slug: string
  brand: string | null
  category: string
  price: number | string
  stock: number
  shipping_class: 'Compact' | 'Medium' | 'Bulky' | null
  is_clearance: boolean
  is_active: boolean
  has_variants: boolean
  variant_group_name: string | null
  image_urls: string[] | null
}

type ProductAddonRelationship = {
  addon_product_id: string
  sort_order: number
}

const productAddonColumns = 'id,name,slug,brand,category,price,stock,shipping_class,is_clearance,is_active,has_variants,variant_group_name,image_urls'

async function fetchRelationships(productId: string) {
  return supabase
    .from('product_addons')
    .select('addon_product_id,sort_order')
    .eq('product_id', productId)
    .order('sort_order')
}

async function fetchRelatedProducts(relationships: ProductAddonRelationship[], publicOnly: boolean) {
  const productIds = relationships.map((relationship) => relationship.addon_product_id)
  if (!productIds.length) return { data: [] as ProductAddon[], error: null }

  let query = supabase.from('products').select(productAddonColumns).in('id', productIds)
  if (publicOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) return { data: [] as ProductAddon[], error }

  const productsById = new Map((data ?? []).map((product) => [product.id, product as ProductAddon]))
  return {
    data: relationships
      .map((relationship) => productsById.get(relationship.addon_product_id))
      .filter((product): product is ProductAddon => Boolean(product)),
    error: null,
  }
}

export async function fetchProductAddons(productId: string) {
  const { data: relationships, error } = await fetchRelationships(productId)
  if (error) return { data: [] as ProductAddon[], error }
  return fetchRelatedProducts((relationships ?? []) as ProductAddonRelationship[], false)
}

export async function fetchPublicProductAddons(productId: string) {
  const { data: relationships, error } = await fetchRelationships(productId)
  if (error) return { data: [] as ProductAddon[], error }
  return fetchRelatedProducts((relationships ?? []) as ProductAddonRelationship[], true)
}

export async function fetchAdminAddonCandidates() {
  return supabase.from('products').select(productAddonColumns).order('name')
}

export async function replaceProductAddons(productId: string, addonProductIds: string[]) {
  const uniqueAddonProductIds = [...new Set(addonProductIds)]
  if (uniqueAddonProductIds.includes(productId)) throw new Error('A product cannot be its own recommended add-on.')

  const { error: deleteError } = await supabase.from('product_addons').delete().eq('product_id', productId)
  if (deleteError) throw deleteError
  if (!uniqueAddonProductIds.length) return []

  const payload = uniqueAddonProductIds.map((addonProductId, sortOrder) => ({
    product_id: productId,
    addon_product_id: addonProductId,
    sort_order: sortOrder,
  }))
  const { data, error } = await supabase.from('product_addons').insert(payload).select('addon_product_id,sort_order')
  if (error) throw error
  return data ?? []
}
