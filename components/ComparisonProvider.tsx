'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { PublicProduct } from './ProductCard'

type Comparison = {
  products: PublicProduct[]
  ready: boolean
  toggle: (product: PublicProduct) => void
  remove: (productId: string) => void
  clear: () => void
  replace: (products: PublicProduct[]) => void
}

const ComparisonContext = createContext<Comparison | null>(null)
const storageKey = 'hydro-blasters-compare'

export function ComparisonProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<PublicProduct[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey) ?? '[]')
      if (Array.isArray(saved)) setProducts(saved.slice(0, 3))
    } catch {}
    setReady(true)
  }, [])

  useEffect(() => {
    if (ready) window.sessionStorage.setItem(storageKey, JSON.stringify(products))
  }, [products, ready])

  const value = useMemo<Comparison>(() => ({
    products,
    ready,
    toggle: (product) => setProducts((current) => current.some((item) => item.id === product.id) ? current.filter((item) => item.id !== product.id) : current.length < 3 ? [...current, product] : current),
    remove: (productId) => setProducts((current) => current.filter((item) => item.id !== productId)),
    clear: () => setProducts([]),
    replace: (nextProducts) => setProducts(nextProducts.filter((product, index, all) => all.findIndex((item) => item.id === product.id) === index).slice(0, 3)),
  }), [products, ready])

  return <ComparisonContext.Provider value={value}>{children}<ComparisonBar /></ComparisonContext.Provider>
}

export function useComparison() {
  const comparison = useContext(ComparisonContext)
  if (!comparison) throw new Error('ComparisonProvider is missing.')
  return comparison
}

function ComparisonBar() {
  const { products, ready, remove, clear } = useComparison()
  if (!ready || products.length === 0) return null
  const href = `/compare?products=${encodeURIComponent(products.map((product) => product.slug).join(','))}`
  const canCompare = products.length >= 2

  return <aside className="comparison-bar" aria-label="Product comparison selection">
    <div className="comparison-bar-copy"><strong>{products.length} of 3 products selected</strong><span>{canCompare ? 'Ready to compare.' : 'Select at least 2 products to compare.'}</span>{products.length === 3 && <span role="status">Maximum of 3 products reached.</span>}</div>
    <div className="comparison-bar-products">{products.map((product) => <div className="comparison-bar-product" key={product.id}><span>{product.name}</span><button type="button" onClick={() => remove(product.id)} aria-label={`Remove ${product.name} from comparison`}>Remove</button></div>)}</div>
    <div className="comparison-bar-actions"><Link className={canCompare ? 'primary-button' : 'comparison-button-disabled'} href={canCompare ? href : '#'} aria-disabled={!canCompare} onClick={(event) => { if (!canCompare) event.preventDefault() }}>Compare Products</Link><button type="button" onClick={clear}>Clear</button></div>
  </aside>
}
