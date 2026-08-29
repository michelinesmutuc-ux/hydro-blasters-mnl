import { supabase } from '../supabase/client'

type CartProductLine = {
  id: string
  product_id?: string
}

export function getCartProductId(line: Pick<CartProductLine, 'id' | 'product_id'>) {
  return line.product_id ?? line.id.split(':')[0]
}

export async function fetchClearanceByProductId(productIds: string[]): Promise<Record<string, boolean> | null> {
  const uniqueProductIds = [...new Set(productIds.filter(Boolean))]
  if (!uniqueProductIds.length) return {}

  const { data, error } = await supabase
    .from('products')
    .select('id,is_clearance')
    .in('id', uniqueProductIds)

  if (error || !data || data.length !== uniqueProductIds.length) return null

  return Object.fromEntries(data.map((product) => [product.id, product.is_clearance === true]))
}
