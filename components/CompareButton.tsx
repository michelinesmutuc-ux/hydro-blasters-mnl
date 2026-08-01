'use client'

import type { PublicProduct } from './ProductCard'
import { useComparison } from './ComparisonProvider'

export function CompareButton({ product, compact = false }: { product: PublicProduct; compact?: boolean }) {
  const { products, toggle } = useComparison()
  const selected = products.some((item) => item.id === product.id)
  const atLimit = products.length >= 3 && !selected
  const label = selected ? 'Added to Compare' : 'Add to Compare'

  return <div className={compact ? 'compare-control compare-control-compact' : 'compare-control'}><button type="button" aria-pressed={selected} disabled={atLimit} onClick={() => toggle(product)}>{label}</button>{selected && <span role="status">Select again to remove.</span>}{atLimit && <span role="status">Maximum of 3 products reached.</span>}</div>
}
