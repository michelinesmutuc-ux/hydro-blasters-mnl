'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'
import { ProductCard, type PublicProduct } from './ProductCard'

export function ShopProducts() {
  const [products, setProducts] = useState<PublicProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  useEffect(() => {
    async function loadProducts() {
      const category = new URLSearchParams(window.location.search).get('category')
      setSelectedCategory(category)
      let query = supabase
        .from('products')
        .select('id,name,slug,brand,category,price,stock,status,image_urls')
        .eq('is_active', true)
      if (category) query = query.eq('category', category)
      const { data, error: queryError } = await query
        .order('featured', { ascending: false })
        .order('created_at', { ascending: false })

      if (queryError) setError(queryError.message)
      else setProducts((data ?? []) as PublicProduct[])
      setLoading(false)
    }
    loadProducts()
  }, [])

  if (loading) return <div className="catalogue-state">Loading products…</div>
  if (error) return <div className="catalogue-state" role="alert">Products are unavailable right now. Please try again later.</div>
  if (products.length === 0) return <div className="catalogue-state">{selectedCategory ? `No active products are available in ${selectedCategory}.` : 'There are no active products to display yet. Please check back soon.'}</div>

  return <><div className="shop-filter-status">{selectedCategory ? <><span>Category: {selectedCategory}</span><a href="/shop">View all products</a></> : <span>All active products</span>}</div><div className="product-grid">{products.map((product) => <ProductCard product={product} key={product.id} />)}</div></>
}
