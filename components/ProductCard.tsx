'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { ProductImageFrame } from './ProductImageFrame'
import { getProductUrl } from '../lib/products/get-product-url'
import { AddToCartButton } from './AddToCartButton'

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
  const productHref = getProductUrl(product)
  const linkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    console.log({
      name: product.name,
      slug: product.slug,
      href: productHref,
      renderedHref: linkRef.current?.getAttribute('href'),
    })
  }, [product.name, product.slug, productHref])

  return (
    <article className="product-card">
      <Link ref={linkRef} className="shop-product-link" href={productHref} aria-label={`View ${product.name}`}>
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
      </Link>
      <AddToCartButton product={product} />
      {actions && <div className="product-card-actions">{actions}</div>}
    </article>
  )
}
