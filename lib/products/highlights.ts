export type HomepageHighlightType = 'none' | 'new_arrival' | 'best_seller' | 'clearance_sale' | 'limited_stock'

/**
 * New Arrivals are intentionally manual. A product is a New Arrival only when
 * it is selected for homepage highlights and its existing homepage label is
 * set to `new_arrival`.
 */
export function isNewArrival(product: { show_on_homepage?: boolean | null; highlight_type?: string | null }) {
  return product.show_on_homepage === true && product.highlight_type === 'new_arrival'
}

export function normalizeHomepageHighlightType(value: string | null | undefined): HomepageHighlightType {
  if (value === 'new_arrival' || value === 'best_seller' || value === 'clearance_sale' || value === 'limited_stock') return value
  return 'none'
}
