'use client'

import type { ReactNode } from 'react'
import { ProductImageFrame } from './ProductImageFrame'

export type PublicProduct = {
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

type ProductCardProps = {
  product: PublicProduct
  actions?: ReactNode
}

function statusLabel(status: PublicProduct['status']) {
  return status.replaceAll('_', ' ')
}

export function ProductCard({ product, actions }: ProductCardProps) {
  const imageUrl = product.image_urls[0]

  return (
    <article className="product-card">
      <a className="shop-product-link" href={`/products/${encodeURIComponent(product.slug)}`} aria-label={`View ${product.name}`}>
        <ProductImageFrame src={imageUrl} alt={product.name} fallbackLabel={`Image unavailable for ${product.name}`} variant="card" />
        <div className="product-card-body">
          <p className="placeholder-label">{product.category}</p>
          <h2>{product.name}</h2>
          <dl className="product-meta">
            <div><dt>Brand</dt><dd>{product.brand || 'Not specified'}</dd></div>
            <div><dt>Price</dt><dd>{product.price}</dd></div>
            <div><dt>Stock</dt><dd>{product.stock}</dd></div>
            <div><dt>Status</dt><dd>{statusLabel(product.status)}</dd></div>
            <div><dt>Pre-order</dt><dd>{product.status === 'preorder' ? 'Available' : 'Not available'}</dd></div>
          </dl>
        </div>
      </a>
      {actions && <div className="product-card-actions">{actions}</div>}
    </article>
  )
}
