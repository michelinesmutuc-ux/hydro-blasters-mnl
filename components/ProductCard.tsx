'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { ProductImageFrame } from './ProductImageFrame'
import { getProductUrl } from '../lib/products/get-product-url'
import { AddToCartButton } from './AddToCartButton'
import { CompareButton } from './CompareButton'

export type HomepageHighlightType = 'new_arrival' | 'featured' | 'best_seller' | 'clearance_sale' | 'limited_stock'

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
  show_on_homepage?: boolean
  highlight_type?: HomepageHighlightType | null
  homepage_sort_order?: number | null
  has_variants?: boolean
  variant_group_name?: string | null
}

type ProductCardProps = {
  product: PublicProduct
  actions?: ReactNode
}

function statusLabel(status: PublicProduct['status']) {
  return status.replaceAll('_', ' ')
}

const highlightLabels: Record<HomepageHighlightType, string> = {
  new_arrival: 'New Arrival',
  featured: 'Featured',
  best_seller: 'Best Seller',
  clearance_sale: 'Clearance Sale',
  limited_stock: 'Limited Stock',
}

export function ProductCard({ product, actions }: ProductCardProps) {
  const imageUrl = product.image_urls[0]
  const productHref = getProductUrl(product)
  return (
    <article className="product-card">
      <Link className="shop-product-link" href={productHref} aria-label={`View ${product.name}`}>
        <ProductImageFrame src={imageUrl} alt={product.name} fallbackLabel={`Image unavailable for ${product.name}`} variant="card" />
      </Link>
      <div className="product-card-body">
        {product.highlight_type && <span className={`product-highlight-badge product-highlight-${product.highlight_type}`}>{highlightLabels[product.highlight_type]}</span>}
        <p className="placeholder-label">{product.category}</p>
        <h2><Link className="product-card-title-link" href={productHref}>{product.name}</Link></h2>
          <dl className="product-meta">
            <div><dt>Brand</dt><dd>{product.brand || 'Not specified'}</dd></div>
            <div><dt>Price</dt><dd>{product.has_variants ? `From ₱${Number(product.price).toLocaleString('en-PH')}` : product.price}</dd></div>
            <div><dt>Stock</dt><dd>{product.stock}</dd></div>
            <div><dt>Status</dt><dd>{statusLabel(product.status)}</dd></div>
          </dl>
        <div className="product-card-footer">{product.has_variants ? <Link className="primary-button" href={productHref}>Choose Options</Link> : <AddToCartButton product={product} />}<div className="product-card-secondary-actions"><Link href={productHref}>View Product</Link><CompareButton product={product} compact /></div></div>
      </div>
      {actions && <div className="product-card-actions">{actions}</div>}
    </article>
  )
}
