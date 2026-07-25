'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'
import { ProductCard, type PublicProduct } from './ProductCard'

type PublicProductsProps = { featuredOnly?: boolean }

export function PublicProducts({ featuredOnly = false }: PublicProductsProps) {
  const [products, setProducts] = useState<PublicProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProducts = useCallback(async () => {
    const { data, error: queryError } = await (() => {
      let query = supabase
        .from('products')
        .select('id,name,slug,brand,category,price,stock,status,image_urls')
        .eq('is_active', true)
      if (featuredOnly) query = query.eq('featured', true)
      return query.order('created_at', { ascending: false })
    })()

    if (queryError) setError(queryError.message)
    else {
      setProducts((data ?? []) as PublicProduct[])
      setError(null)
    }
    setLoading(false)
  }, [featuredOnly])

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
  if (products.length === 0) return <div className="catalogue-state">There are no active products to display yet. Please check back soon.</div>

  return <div className="product-grid">
    {products.map((product) => <ProductCard product={product} key={product.id} />)}
  </div>
}
