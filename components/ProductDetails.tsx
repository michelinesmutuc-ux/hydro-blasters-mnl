'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ProductImageFrame } from './ProductImageFrame'
import { CompareButton } from './CompareButton'
import { ProductHelpCallout } from './ProductHelpCallout'
import { useCart } from './CartProvider'

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
export type ProductSpecification = {
  id: string
  label: string
  value: string
  sort_order: number
  updated_at?: string
}

function statusLabel(status: Product['status']) {
  return status.replaceAll('_', ' ')
}

function ProductUnavailable() {
  return <section className="section product-unavailable"><p className="eyebrow">Product unavailable</p><h1>This product is not available</h1><p>The product may no longer exist or is not currently active.</p><a className="primary-button" href="/shop">Return to shop</a></section>
}

function ProductPurchaseActions({ product }: { product: Product }) {
  const { add, lines, subtotal } = useCart()
  const [quantity, setQuantity] = useState(1)
  const [confirmation, setConfirmation] = useState<'cart' | 'buy' | null>(null)
  const [reviewRequested, setReviewRequested] = useState(false)
  const [buyingNow, setBuyingNow] = useState(false)
  const buyNowLock = useRef(false)
  const unavailableReason = product.stock < 1 || product.status === 'out_of_stock' ? 'Out of stock' : ''
  const cartProduct = { ...product, image_urls: product.image_urls ?? [] }

  useEffect(() => {
    if (!reviewRequested) return
    setConfirmation('buy')
    setReviewRequested(false)
    setBuyingNow(false)
  }, [lines, reviewRequested])

  function addToCart() {
    if (unavailableReason) return
    add(cartProduct, quantity)
    setConfirmation('cart')
  }

  function buyNow() {
    if (unavailableReason || buyingNow || buyNowLock.current || confirmation === 'buy') return
    buyNowLock.current = true
    setBuyingNow(true)
    add(cartProduct, quantity)
    setReviewRequested(true)
  }

  function changeQuantity(nextQuantity: number) {
    setQuantity(nextQuantity)
    setConfirmation(null)
    buyNowLock.current = false
  }

  if (unavailableReason) return <p className="product-purchase-unavailable" role="status">{unavailableReason}</p>

  return <div className="product-purchase-actions">
    <label className="product-quantity-control">Quantity<div><button type="button" aria-label={`Decrease ${product.name} quantity`} disabled={quantity <= 1} onClick={() => changeQuantity(quantity - 1)}>−</button><output aria-label={`${product.name} quantity`}>{quantity}</output><button type="button" aria-label={`Increase ${product.name} quantity`} disabled={quantity >= product.stock} onClick={() => changeQuantity(Math.min(product.stock, quantity + 1))}>+</button></div></label>
    <div className="product-purchase-buttons"><button type="button" className="secondary-button" onClick={addToCart}>Add to Cart</button><button type="button" className="primary-button" disabled={buyingNow} onClick={buyNow}>{buyingNow ? 'Opening Checkout…' : 'Buy Now'}</button></div>
    {confirmation && <div className="product-cart-confirmation" role="status">{confirmation === 'buy' ? lines.length > 0 ? <><strong>🛒 Review Your Cart</strong><dl className="product-cart-review">{lines.map((line) => <div key={line.id}><dt>{line.name}<small>Qty: {line.quantity} × ₱{Number(line.price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small></dt><dd>₱{(Number(line.price) * line.quantity).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>)}</dl><p className="product-cart-total">🛒 {lines.reduce((count, line) => count + line.quantity, 0)} Items <span>•</span> ₱{subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></> : <span>Unable to load your updated cart. Please review your cart before checkout.</span> : <span>✓ {product.name} added to your cart.</span>}<Link href="/checkout">Proceed to Checkout →</Link><button type="button" aria-label="Dismiss cart confirmation" onClick={() => { setConfirmation(null); buyNowLock.current = false }}>Dismiss</button></div>}
  </div>
}

export function ProductDetails({ product, specificationRows = [], error }: { product: Product | null; specificationRows?: ProductSpecification[]; error?: string | null }) {
  const [selectedImage, setSelectedImage] = useState(0)

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
          <ProductPurchaseActions product={product} />
          <CompareButton product={{ ...product, image_urls: product.image_urls ?? [] }} />
          <dl className="product-detail-meta"><div><dt>Brand</dt><dd>{product.brand || 'Not specified'}</dd></div><div><dt>Stock</dt><dd>{product.stock}</dd></div><div><dt>Status</dt><dd>{statusLabel(product.status)}</dd></div></dl>
          {product.short_description && <p className="product-short-description">{product.short_description}</p>}
          {descriptionParagraphs.length > 0 && <div className="product-description"><h2>Description</h2>{descriptionParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
          {specificationRows.length > 0 && <section className="product-specifications"><h2>Specifications</h2><dl>{specificationRows.map((row) => <div key={row.id}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl></section>}
          <ProductHelpCallout specifications={specificationRows} />
        </div>
      </div>
    </section>
  )
}

function stylesForThumbnail(selected: boolean) {
  return selected ? 'product-thumbnail product-thumbnail-selected' : 'product-thumbnail'
}
