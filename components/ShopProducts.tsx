'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'

type ShopProduct = {
  id: string
  name: string
  slug: string
  brand: string | null
  category: string
  price: number | string
  stock: number
  status: 'draft' | 'in_stock' | 'out_of_stock' | 'preorder'
  image_urls: string[]
}

function statusLabel(status: ShopProduct['status']) {
  return status.replaceAll('_', ' ')
}

function ProductImage({ product }: { product: ShopProduct }) {
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = product.image_urls[0]

  if (!imageUrl || imageFailed) return <div className="product-placeholder-image" role="img" aria-label={`Image unavailable for ${product.name}`}>Product image unavailable</div>
  return <img className="product-image" src={imageUrl} alt={product.name} onError={() => setImageFailed(true)} />
}

export function ShopProducts() {
  const [products, setProducts] = useState<ShopProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadProducts() {
      const { data, error: queryError } = await supabase
        .from('products')
        .select('id,name,slug,brand,category,price,stock,status,image_urls')
        .eq('is_active', true)
        .order('featured', { ascending: false })
        .order('created_at', { ascending: false })

      if (queryError) setError(queryError.message)
      else setProducts((data ?? []) as ShopProduct[])
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
        <a className="shop-product-link" href={`/products/${product.slug}`} aria-label={`View ${product.name}`}>
          <ProductImage product={product} />
          <div className="product-card-body">
            <p className="placeholder-label">{product.category}</p>
            <h2>{product.name}</h2>
            <dl className="product-meta">
              <div><dt>Brand</dt><dd>{product.brand || 'Not specified'}</dd></div>
              <div><dt>Price</dt><dd>{product.price}</dd></div>
              <div><dt>Stock</dt><dd>{product.stock}</dd></div>
              <div><dt>Stock status</dt><dd>{statusLabel(product.status)}</dd></div>
              <div><dt>Pre-order</dt><dd>{product.status === 'preorder' ? 'Available' : 'Not available'}</dd></div>
            </dl>
          </div>
        </a>
      </article>
    ))}
  </div>
}
