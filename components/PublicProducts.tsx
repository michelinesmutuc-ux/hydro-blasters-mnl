'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchActiveProducts } from '../lib/supabase/products'
import { ProductCard, type PublicProduct } from './ProductCard'
import { ShopFloatingCheckout } from './ShopFloatingCheckout'

type PublicProductsProps = { homepageHighlights?: boolean }

export function PublicProducts({ homepageHighlights = false }: PublicProductsProps) {
  const [products, setProducts] = useState<PublicProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProducts = useCallback(async () => {
    const { data, error: queryError } = await fetchActiveProducts({ homepageOnly: homepageHighlights })

    if (queryError) setError(queryError.message)
    else {
      setProducts((data ?? []) as PublicProduct[])
      setError(null)
    }
    setLoading(false)
  }, [homepageHighlights])

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

  const visibleProducts = homepageHighlights ? products.slice(0, 6) : products
  return <><div className="product-grid">{visibleProducts.map((product, index) => <ProductCard product={product} eagerImage={index < 3} key={product.id} />)}</div>{homepageHighlights && products.length > visibleProducts.length && <div className="product-list-more"><a className="secondary-button" href="/shop">View All Products</a></div>}<ShopFloatingCheckout /></>
}
