type ShopOrderProduct = {
  id: string
  name: string
  created_at: string
  show_on_homepage?: boolean
  homepage_sort_order?: number | null
}

/** Use the existing homepage selection as the merchant's featured flag. */
export function compareFeaturedProducts(first: ShopOrderProduct, second: ShopOrderProduct) {
  const featured = Number(second.show_on_homepage === true) - Number(first.show_on_homepage === true)
  if (featured) return featured
  if (first.show_on_homepage === true && second.show_on_homepage === true) {
    const rank = (first.homepage_sort_order ?? Number.MAX_SAFE_INTEGER) - (second.homepage_sort_order ?? Number.MAX_SAFE_INTEGER)
    if (rank) return rank
  }
  return new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
    || first.name.localeCompare(second.name) || first.id.localeCompare(second.id)
}
