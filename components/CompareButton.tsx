'use client'

import type { PublicProduct } from './ProductCard'
import { useComparison } from './ComparisonProvider'

export function CompareButton({ product }: { product: PublicProduct }) {
  const { products, toggle } = useComparison()
  const selected = products.some((item) => item.id === product.id)
  const atLimit = products.length >= 3 && !selected
  const label = selected ? 'Remove from compare' : 'Compare'

  return <div className="compare-control"><button type="button" aria-pressed={selected} disabled={atLimit} onClick={() => toggle(product)}>{label}</button>{atLimit && <span role="status">Maximum of 3 products reached.</span>}</div>
}
