'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ProductImageFrame } from './ProductImageFrame'
import { CompareButton } from './CompareButton'
import { ProductHelpCallout } from './ProductHelpCallout'
import { useCart } from './CartProvider'
import type { ProductVariant } from '../lib/supabase/product-variants'

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
  has_variants?: boolean
  variant_group_name?: string | null
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

function peso(value: number | string) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value))
}

function ProductUnavailable() {
  return <section className="section product-unavailable"><p className="eyebrow">Product unavailable</p><h1>This product is not available</h1><p>The product may no longer exist or is not currently active.</p><a className="primary-button" href="/shop">Return to shop</a></section>
}

function ProductPurchaseActions({ product, variants, onVariantImageChange }: { product: Product; variants: ProductVariant[]; onVariantImageChange: (imageUrl: string | null) => void }) {
  const { add, lines, subtotal } = useCart()
  const [quantity, setQuantity] = useState(1)
  const [confirmation, setConfirmation] = useState<'cart' | 'buy' | null>(null)
  const [reviewRequested, setReviewRequested] = useState(false)
  const [buyingNow, setBuyingNow] = useState(false)
  const buyNowLock = useRef(false)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId) ?? null
  const hasVariants = Boolean(product.has_variants)
  const availableStock = hasVariants ? selectedVariant?.stock ?? 0 : product.stock
  const unavailableReason = product.status === 'out_of_stock' ? 'Out of stock' : selectedVariant && selectedVariant.stock < 1 ? 'Out of stock' : !hasVariants && product.stock < 1 ? 'Out of stock' : ''
  const currentPrice = selectedVariant?.price ?? product.price
  const cartProduct = selectedVariant ? { ...product, id: `${product.id}:${selectedVariant.id}`, product_id: product.id, variant_id: selectedVariant.id, variant_group_name: product.variant_group_name ?? 'Option', variant_name: selectedVariant.name, price: selectedVariant.price, stock: selectedVariant.stock, image_urls: selectedVariant.image_url ? [selectedVariant.image_url] : product.image_urls ?? [] } : { ...product, image_urls: product.image_urls ?? [] }

  useEffect(() => {
    if (!reviewRequested) return
    setConfirmation('buy')
    setReviewRequested(false)
    setBuyingNow(false)
  }, [lines, reviewRequested])

  function addToCart() {
    if (hasVariants && !selectedVariant) { setSelectionError(`Please choose a ${product.variant_group_name || 'variant'} before continuing.`); return }
    if (unavailableReason) return
    add(cartProduct, quantity)
    setConfirmation('cart')
  }

  function buyNow() {
    if (hasVariants && !selectedVariant) { setSelectionError(`Please choose a ${product.variant_group_name || 'variant'} before continuing.`); return }
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

  return <div className="product-purchase-actions">
    {hasVariants && <p className="product-variant-price">{selectedVariant ? peso(currentPrice) : `From ${peso(product.price)}`}</p>}
    {hasVariants && <fieldset className="variant-selector"><legend>Choose {product.variant_group_name || 'Option'}</legend><div>{variants.map((variant) => <button type="button" key={variant.id} className={selectedVariantId === variant.id ? 'variant-option variant-option-selected' : 'variant-option'} onClick={() => { setSelectedVariantId(variant.id); onVariantImageChange(variant.image_url || null); setSelectionError(null); setQuantity(1); setConfirmation(null) }} aria-pressed={selectedVariantId === variant.id} disabled={variant.stock < 1}>{variant.name}<small>{Number(variant.price).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}{variant.stock < 1 ? ' · Out of Stock' : ''}</small></button>)}</div></fieldset>}
    {selectionError && <p className="product-purchase-unavailable" role="status">{selectionError}</p>}
    {unavailableReason && selectedVariant && <p className="product-purchase-unavailable" role="status">{unavailableReason}</p>}
    <label className="product-quantity-control">Quantity<div><button type="button" aria-label={`Decrease ${product.name} quantity`} disabled={quantity <= 1 || !selectedVariant && hasVariants} onClick={() => changeQuantity(quantity - 1)}>−</button><output aria-label={`${product.name} quantity`}>{quantity}</output><button type="button" aria-label={`Increase ${product.name} quantity`} disabled={quantity >= availableStock || !selectedVariant && hasVariants} onClick={() => changeQuantity(Math.min(availableStock, quantity + 1))}>+</button></div></label>
    <div className="product-purchase-buttons"><button type="button" className="secondary-button" disabled={Boolean(unavailableReason)} onClick={addToCart}>Add to Cart</button><button type="button" className="primary-button" disabled={buyingNow || Boolean(unavailableReason)} onClick={buyNow}>{buyingNow ? 'Opening Checkout…' : 'Buy Now'}</button></div>
    {confirmation && <div className="product-cart-confirmation" role="status">{confirmation === 'buy' ? lines.length > 0 ? <><strong>🛒 Review Your Cart</strong><dl className="product-cart-review">{lines.map((line) => <div key={line.id}><dt>{line.name}{line.variant_name && <small>{line.variant_group_name || 'Option'}: {line.variant_name}</small>}<small>Qty: {line.quantity} × ₱{Number(line.price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small></dt><dd>₱{(Number(line.price) * line.quantity).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>)}</dl><p className="product-cart-total">🛒 {lines.reduce((count, line) => count + line.quantity, 0)} Items <span>•</span> ₱{subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></> : <span>Unable to load your updated cart. Please review your cart before checkout.</span> : <span>✓ {product.name}{selectedVariant ? ` — ${selectedVariant.name}` : ''} added to your cart.</span>}<Link href="/checkout">Proceed to Checkout →</Link><button type="button" aria-label="Dismiss cart confirmation" onClick={() => { setConfirmation(null); buyNowLock.current = false }}>Dismiss</button></div>}
  </div>
}

export function ProductDetails({ product, specificationRows = [], variantRows = [], error }: { product: Product | null; specificationRows?: ProductSpecification[]; variantRows?: ProductVariant[]; error?: string | null }) {
  const [selectedImage, setSelectedImage] = useState(0)
  const [selectedVariantImage, setSelectedVariantImage] = useState<string | null>(null)

  if (error) return <section className="section"><div className="catalogue-state" role="alert">This product could not be loaded. Please try again later.</div></section>
  if (!product) return <ProductUnavailable />

  const firstImage = product.image_urls?.[0] ?? null
  const mainImage = selectedVariantImage ?? product.image_urls?.[selectedImage] ?? firstImage
  const productImages = product.image_urls ?? []
  const descriptionParagraphs = product.description?.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean) ?? []

  return (
    <section className="section product-detail">
      <a className="back-link" href="/shop">← Back to shop</a>
      <div className="product-detail-grid">
        <div className="product-gallery">
          <ProductImageFrame src={mainImage} alt={product.name} fallbackLabel={`Image unavailable for ${product.name}`} variant="main" />
          {productImages.length > 1 && <div className="product-thumbnails" aria-label="Product images">{productImages.map((imageUrl, index) => <button className={`${stylesForThumbnail(!selectedVariantImage && index === selectedImage)}`} type="button" key={imageUrl} onClick={() => { setSelectedVariantImage(null); setSelectedImage(index) }} aria-label={`Show image ${index + 1} of ${product.name}`} aria-pressed={!selectedVariantImage && index === selectedImage}><ProductImageFrame src={imageUrl} alt="" fallbackLabel={`Image ${index + 1}`} variant="thumbnail" /></button>)}</div>}
        </div>
        <div className="product-detail-copy">
          <p className="eyebrow">{product.category}</p>
          <h1>{product.name}</h1>
          {!product.has_variants && <p className="product-price">{peso(product.price)}</p>}
          <ProductPurchaseActions product={product} variants={variantRows} onVariantImageChange={setSelectedVariantImage} />
          <CompareButton product={{ ...product, image_urls: product.image_urls ?? [] }} />
          <dl className="product-detail-meta"><div><dt>Brand</dt><dd>{product.brand || 'Not specified'}</dd></div><div><dt>Stock</dt><dd>{product.has_variants ? `${product.stock} across variants` : product.stock}</dd></div><div><dt>Status</dt><dd>{statusLabel(product.status)}</dd></div></dl>
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
