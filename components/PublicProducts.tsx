'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'

type Product = {
  id: string
  name: string
  brand: string | null
  category: string
  price: number | string
  stock: number
  status: string
  image_urls: string[]
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

function ProductImage({ product }: { product: Product }) {
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = product.image_urls[0]

  if (!imageUrl || imageFailed) return <div className="product-placeholder-image" role="img" aria-label={`Image unavailable for ${product.name}`}>Product image unavailable</div>

  return <img className="product-image" src={imageUrl} alt={product.name} onError={() => setImageFailed(true)} />
}

export function PublicProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadProducts() {
      const { data, error: queryError } = await supabase
        .from('products')
        .select('id,name,brand,category,price,stock,status,image_urls')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (queryError) setError(queryError.message)
      else setProducts((data ?? []) as Product[])
      setLoading(false)
    }
    loadProducts()
  }, [])

  if (loading) return <div className="catalogue-state">Loading products…</div>
  if (error) return <div className="catalogue-state" role="alert">Products are unavailable right now. Please try again later.</div>
  if (products.length === 0) return <div className="catalogue-state">There are no active products to display yet. Please check back soon.</div>

  return <div className="product-grid">
    {products.map((product) => (
      <article className="product-card" key={product.id}>
        <ProductImage product={product} />
        <div className="product-card-body">
          <p className="placeholder-label">{product.category}</p>
          <h3>{product.name}</h3>
          <dl className="product-meta">
            <div><dt>Brand</dt><dd>{product.brand || 'Not specified'}</dd></div>
            <div><dt>Price</dt><dd>{product.price}</dd></div>
            <div><dt>Stock</dt><dd>{product.stock}</dd></div>
            <div><dt>Status</dt><dd>{statusLabel(product.status)}</dd></div>
          </dl>
        </div>
      </article>
    ))}
  </div>
}
