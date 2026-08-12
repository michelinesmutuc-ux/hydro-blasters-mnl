'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchActiveProducts } from '../lib/supabase/products'
import { ProductCard, type PublicProduct } from './ProductCard'
import { ShopFloatingCheckout } from './ShopFloatingCheckout'

type PublicProductsProps = { featuredOnly?: boolean; homepageHighlights?: boolean }

export function PublicProducts({ featuredOnly = false, homepageHighlights = false }: PublicProductsProps) {
  const [products, setProducts] = useState<PublicProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProducts = useCallback(async () => {
    const { data, error: queryError } = await fetchActiveProducts({ featuredOnly, homepageOnly: homepageHighlights })

    if (queryError) setError(queryError.message)
    else {
      setProducts((data ?? []) as PublicProduct[])
      setError(null)
    }
    setLoading(false)
  }, [featuredOnly, homepageHighlights])

  useEffect(() => {
    loadProducts()
    window.addEventListener('hydro-products-updated', loadProducts)
    window.addEventListener('focus', loadProducts)
    window.addEventListener('storage', loadProducts)
    return () => {
      window.removeEventListener('hydro-products-updated', loadProducts)
      window.removeEventListener('focus', loadProducts)
      window.removeEventListener('storage', loadProducts)
    }
  }, [loadProducts])

  if (loading) return <div className="catalogue-state">Loading products…</div>
  if (error) return <div className="catalogue-state" role="alert">Products are unavailable right now. Please try again later.</div>
  if (products.length === 0) return <div className="catalogue-state">{homepageHighlights ? 'No homepage highlights have been selected yet. Please check back soon.' : 'There are no active products to display yet. Please check back soon.'}</div>

  return <><div className="product-grid">{products.map((product) => <ProductCard product={product} key={product.id} />)}</div><ShopFloatingCheckout /></>
}
