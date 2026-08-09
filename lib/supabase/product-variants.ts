import { supabase } from './client'

export type ProductVariant = {
  id: string
  product_id: string
  name: string
  price: number | string
  stock: number
  sku: string | null
  image_url: string | null
  sort_order: number
}

export type VariantDraft = {
  id: string
  name: string
  price: string | number
  stock: string | number
  sku: string | null
  image_url: string | null
  image_file?: File | null
}

export function validateVariants(hasVariants: boolean, rows: VariantDraft[]) {
  if (!hasVariants) return []
  if (rows.length === 0) throw new Error('Add at least one variant before saving this product.')
  const seen = new Set<string>()
  return rows.map((row, index) => {
    const name = row.name.trim()
    const price = Number(row.price)
    const stock = Number(row.stock)
    const key = name.toLocaleLowerCase()
    if (!name) throw new Error(`Variant ${index + 1} needs a name.`)
    if (seen.has(key)) throw new Error(`Variant names must be unique. “${name}” is repeated.`)
    if (!Number.isFinite(price) || price < 0) throw new Error(`Variant ${name} needs a valid non-negative price.`)
    if (!Number.isSafeInteger(stock) || stock < 0) throw new Error(`Variant ${name} needs a valid whole-number stock value.`)
    seen.add(key)
    return { product_id: '', name, price, stock, sku: row.sku?.trim() || null, image_url: row.image_url?.trim() || null, sort_order: index }
  })
}

export async function fetchProductVariants(productId: string) {
  return supabase.from('product_variants').select('id,product_id,name,price,stock,sku,image_url,sort_order').eq('product_id', productId).order('sort_order')
}

export async function replaceProductVariants(productId: string, rows: VariantDraft[]) {
  const { error: deleteError } = await supabase.from('product_variants').delete().eq('product_id', productId)
  if (deleteError) throw deleteError
  if (rows.length === 0) return []
  const payload = validateVariants(true, rows).map((row) => ({ ...row, product_id: productId }))
  const { data, error } = await supabase.from('product_variants').insert(payload).select('id,product_id,name,price,stock,sku,image_url,sort_order')
  if (error) throw error
  return data ?? []
}
