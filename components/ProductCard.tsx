'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { ProductImageFrame } from './ProductImageFrame'
import { getProductUrl } from '../lib/products/get-product-url'
import { AddToCartButton } from './AddToCartButton'
import { CompareButton } from './CompareButton'
import type { GelBlasterType } from '../lib/products/product-types'

export type HomepageHighlightType = 'new_arrival' | 'best_seller' | 'clearance_sale' | 'limited_stock'

export type PublicProduct = {
  id: string
  name: string
  slug: string
  brand: string | null
  category: string
  product_type?: GelBlasterType | null
  price: number | string
  stock: number
  status: 'draft' | 'in_stock' | 'out_of_stock' | 'preorder'
  image_urls: string[]
  show_on_homepage?: boolean
  highlight_type?: HomepageHighlightType | null
  homepage_sort_order?: number | null
  is_clearance?: boolean
  is_best_seller?: boolean
  shipping_class?: 'Compact' | 'Medium' | 'Bulky'
  has_variants?: boolean
  variant_group_name?: string | null
}

type ProductCardProps = {
  product: PublicProduct
  actions?: ReactNode
  eagerImage?: boolean
}

function peso(value: number | string) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value))
}

const highlightLabels: Record<HomepageHighlightType, string> = {
  new_arrival: 'New Arrival',
  best_seller: 'Best Seller',
  clearance_sale: 'Clearance Sale',
  limited_stock: 'Limited Stock',
}

export function ProductCard({ product, actions, eagerImage = false }: ProductCardProps) {
  const imageUrl = product.image_urls[0]
  const productHref = getProductUrl(product)
  const homepageBadge = product.highlight_type && product.highlight_type in highlightLabels ? product.highlight_type : null
  return (
    <article className="product-card">
      <Link className="shop-product-link" href={productHref} aria-label={`View ${product.name}`}>
        <ProductImageFrame src={imageUrl} alt={product.name} fallbackLabel={`Image unavailable for ${product.name}`} variant="card" eager={eagerImage} />
      </Link>
      <div className="product-card-body">
        {product.is_clearance ? <span className="product-highlight-badge product-highlight-clearance_sale">Clearance Sale</span> : homepageBadge && <span className={`product-highlight-badge product-highlight-${homepageBadge}`}>{highlightLabels[homepageBadge]}</span>}
        <p className="placeholder-label">{product.category}</p>
        <h2><Link className="product-card-title-link" href={productHref}>{product.name}</Link></h2>
          <dl className="product-meta">
            <div><dt>Brand</dt><dd>{product.brand || 'Not specified'}</dd></div>
            <div><dt>Price</dt><dd className="product-price-value">{product.has_variants ? `From ${peso(product.price)}` : peso(product.price)}</dd></div>
            <div><dt>Stock</dt><dd>{product.stock}</dd></div>
            <div><dt>Availability</dt><dd>{product.stock > 0 ? 'In stock' : 'Out of stock'}</dd></div>
          </dl>
        <div className="product-card-footer">{product.has_variants ? <Link className="primary-button" href={productHref}>Choose Options</Link> : <AddToCartButton product={product} />}<div className="product-card-secondary-actions"><Link href={productHref}>View Product</Link><CompareButton product={product} compact /></div></div>
      </div>
      {actions && <div className="product-card-actions">{actions}</div>}
    </article>
  )
}
