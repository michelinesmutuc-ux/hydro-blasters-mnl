'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'
import { ProductCard, type PublicProduct } from './ProductCard'

type PublicProductsProps = { featuredOnly?: boolean }

export function PublicProducts({ featuredOnly = false }: PublicProductsProps) {
  const [products, setProducts] = useState<PublicProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadProducts() {
      let query = supabase
        .from('products')
        .select('id,name,slug,brand,category,price,stock,status,image_urls')
        .eq('is_active', true)
      if (featuredOnly) query = query.eq('featured', true)
      const { data, error: queryError } = await query
        .order('created_at', { ascending: false })

      if (queryError) setError(queryError.message)
      else setProducts((data ?? []) as PublicProduct[])
      setLoading(false)
    }
    loadProducts()
  }, [featuredOnly])

  if (loading) return <div className="catalogue-state">Loading products…</div>
  if (error) return <div className="catalogue-state" role="alert">Products are unavailable right now. Please try again later.</div>
  if (products.length === 0) return <div className="catalogue-state">There are no active products to display yet. Please check back soon.</div>

  return <div className="product-grid">
    {products.map((product) => <ProductCard product={product} key={product.id} />)}
  </div>
}
