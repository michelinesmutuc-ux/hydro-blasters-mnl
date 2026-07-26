'use client'

import { useEffect, useState } from 'react'
import { ProductImageFrame } from './ProductImageFrame'

export type Product = {
  id: string
  name: string
  slug: string
  brand: string | null
  category: string
  price: number | string
  stock: number
  status: 'draft' | 'in_stock' | 'out_of_stock' | 'preorder'
  short_description: string | null
  description: string | null
  image_urls?: string[]
}
export type ProductSpecification = { id: string; label: string; value: string; sort_order: number }

function statusLabel(status: Product['status']) {
  return status.replaceAll('_', ' ')
}

function ProductUnavailable() {
  return <section className="section product-unavailable"><p className="eyebrow">Product unavailable</p><h1>This product is not available</h1><p>The product may no longer exist or is not currently active.</p><a className="primary-button" href="/shop">Return to shop</a></section>
}

export function ProductDetails({ product, specificationRows = [], error }: { product: Product | null; specificationRows?: ProductSpecification[]; error?: string | null }) {
  const [selectedImage, setSelectedImage] = useState(0)

  useEffect(() => {
    if (product) {
      console.log(product)
      console.log(product.image_urls)
    }
  }, [product])

  if (error) return <section className="section"><div className="catalogue-state" role="alert">This product could not be loaded. Please try again later.</div></section>
  if (!product) return <ProductUnavailable />

  const firstImage = product.image_urls?.[0] ?? null
  const mainImage = product.image_urls?.[selectedImage] ?? firstImage
  const productImages = product.image_urls ?? []
  const descriptionParagraphs = product.description?.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean) ?? []

  return (
    <section className="section product-detail">
      <a className="back-link" href="/shop">← Back to shop</a>
      <div className="product-detail-grid">
        <div className="product-gallery">
          <ProductImageFrame src={mainImage} alt={product.name} fallbackLabel={`Image unavailable for ${product.name}`} variant="main" />
          {productImages.length > 1 && <div className="product-thumbnails" aria-label="Product images">{productImages.map((imageUrl, index) => <button className={`${stylesForThumbnail(index === selectedImage)}`} type="button" key={imageUrl} onClick={() => setSelectedImage(index)} aria-label={`Show image ${index + 1} of ${product.name}`} aria-pressed={index === selectedImage}><ProductImageFrame src={imageUrl} alt="" fallbackLabel={`Image ${index + 1}`} variant="thumbnail" /></button>)}</div>}
        </div>
        <div className="product-detail-copy">
          <p className="eyebrow">{product.category}</p>
          <h1>{product.name}</h1>
          <p className="product-price">{product.price}</p>
          <dl className="product-detail-meta"><div><dt>Brand</dt><dd>{product.brand || 'Not specified'}</dd></div><div><dt>Stock</dt><dd>{product.stock}</dd></div><div><dt>Status</dt><dd>{statusLabel(product.status)}</dd></div><div><dt>Pre-order</dt><dd>{product.status === 'preorder' ? 'Available' : 'Not available'}</dd></div></dl>
          {product.short_description && <p className="product-short-description">{product.short_description}</p>}
          {descriptionParagraphs.length > 0 && <div className="product-description"><h2>Description</h2>{descriptionParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
          {specificationRows.length > 0 && <section className="product-specifications"><h2>Specifications</h2><dl>{specificationRows.map((row) => <div key={row.id}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl></section>}
        </div>
      </div>
    </section>
  )
}

function stylesForThumbnail(selected: boolean) {
  return selected ? 'product-thumbnail product-thumbnail-selected' : 'product-thumbnail'
}
