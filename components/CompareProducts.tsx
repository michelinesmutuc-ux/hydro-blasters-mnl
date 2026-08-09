'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchActiveProductsBySlugs } from '../lib/supabase/products'
import { fetchProductSpecificationsForProducts, type ProductSpecification } from '../lib/supabase/product-specifications'
import { getProductUrl } from '../lib/products/get-product-url'
import { AddToCartButton } from './AddToCartButton'
import { ProductImageFrame } from './ProductImageFrame'
import { useComparison } from './ComparisonProvider'
import type { PublicProduct } from './ProductCard'

type ComparisonRow = { key: string; label: string; values: (string | null)[]; different: boolean }
const normalizeLabel = (value: string) => value.trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase()
const peso = (value: number | string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value))
const statusLabel = (value: PublicProduct['status']) => value.replaceAll('_', ' ')

export function CompareProducts() {
  const { products: savedProducts, ready, replace, remove, clear } = useComparison()
  const [requestedSlugs, setRequestedSlugs] = useState<string[]>([])
  const [products, setProducts] = useState<PublicProduct[]>([])
  const [specifications, setSpecifications] = useState<ProductSpecification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [highlightDifferences, setHighlightDifferences] = useState(true)

  useEffect(() => {
    if (!ready) return
    const querySlugs = new URLSearchParams(window.location.search).get('products')?.split(',').map((slug) => slug.trim()).filter(Boolean).slice(0, 3) ?? []
    const nextSlugs = querySlugs.length > 0 ? Array.from(new Set(querySlugs)) : savedProducts.map((product) => product.slug)
    setRequestedSlugs((current) => current.length > 0 ? current : nextSlugs)
  }, [ready, savedProducts])

  useEffect(() => {
    if (requestedSlugs.length === 0) { setProducts([]); setSpecifications([]); setLoading(false); return }
    let active = true
    async function load() {
      setLoading(true)
      const { data, error: productError } = await fetchActiveProductsBySlugs(requestedSlugs)
      if (productError || !active) { if (active) { setError(productError?.message ?? 'Products could not be loaded.'); setLoading(false) }; return }
      const bySlug = new Map(((data ?? []) as PublicProduct[]).map((product) => [product.slug, product]))
      const orderedProducts = requestedSlugs.map((slug) => bySlug.get(slug)).filter((product): product is PublicProduct => Boolean(product))
      const { data: specificationData, error: specificationError } = await fetchProductSpecificationsForProducts(orderedProducts.map((product) => product.id))
      if (!active) return
      if (specificationError) { setError(specificationError.message); setLoading(false); return }
      setProducts(orderedProducts)
      setSpecifications((specificationData ?? []) as ProductSpecification[])
      replace(orderedProducts)
      setError(null)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [requestedSlugs])

  const rows = useMemo<ComparisonRow[]>(() => {
    const rowsByProduct = new Map(products.map((product) => [product.id, specifications.filter((row) => row.product_id === product.id)]))
    const seen = new Map<string, { label: string; values: (string | null)[] }>()
    products.forEach((product, productIndex) => {
      for (const specification of rowsByProduct.get(product.id) ?? []) {
        const key = normalizeLabel(specification.label)
        const current = seen.get(key) ?? { label: specification.label.trim(), values: Array(products.length).fill(null) }
        current.values[productIndex] = specification.value
        seen.set(key, current)
      }
    })
    return Array.from(seen, ([key, row]) => ({ key, ...row, different: new Set(row.values.map((value) => value?.trim() ?? '—')).size > 1 }))
  }, [products, specifications])

  function removeProduct(product: PublicProduct) {
    remove(product.id)
    const nextSlugs = requestedSlugs.filter((slug) => slug !== product.slug)
    setRequestedSlugs(nextSlugs)
    const query = nextSlugs.length ? `?products=${encodeURIComponent(nextSlugs.join(','))}` : ''
    window.history.replaceState({}, '', `/compare${query}`)
  }

  function clearProducts() {
    clear()
    setRequestedSlugs([])
    window.history.replaceState({}, '', '/compare')
  }

  if (loading) return <div className="catalogue-state">Loading selected products…</div>
  if (error) return <div className="catalogue-state" role="alert">Comparison is unavailable right now. Please try again later.</div>
  if (products.length < 2) return <div className="compare-insufficient"><p className="eyebrow">Product comparison</p><h1>Choose at least two products to compare.</h1><p>Products that are no longer active are removed from comparison automatically.</p><Link className="primary-button" href="/shop">Browse Products</Link></div>

  return <div className="compare-content">
    <div className="compare-toolbar"><label className="compare-highlight"><input type="checkbox" checked={highlightDifferences} onChange={(event) => setHighlightDifferences(event.target.checked)} /> Highlight differences</label><button type="button" onClick={clearProducts}>Clear comparison</button></div>
    <p className="compare-scroll-hint">Swipe sideways to compare all products.</p>
    <div className="compare-table-wrap"><table className="compare-table"><thead><tr><th scope="col">Product</th>{products.map((product) => <th scope="col" key={product.id}><div className="compare-product-header"><ProductImageFrame src={product.image_urls[0]} alt={product.name} fallbackLabel={`Image unavailable for ${product.name}`} variant="card" /><h2>{product.name}</h2><p>{product.has_variants ? `From ${peso(product.price)}` : peso(product.price)}</p><span>{product.category}</span><span>{product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'} · {statusLabel(product.status)}</span><Link href={getProductUrl(product)}>View Product</Link>{product.has_variants ? <Link className="primary-button" href={getProductUrl(product)}>Choose Options</Link> : <AddToCartButton product={product}/>}<button type="button" onClick={() => removeProduct(product)}>Remove</button></div></th>)}</tr></thead><tbody>{rows.length > 0 && <tr className="compare-section-row"><th colSpan={products.length + 1}>Specifications</th></tr>}{rows.map((row) => <tr className={highlightDifferences && row.different ? 'compare-row-different' : ''} key={row.key}><th scope="row">{row.label}{highlightDifferences && row.different && <span>Different</span>}</th>{row.values.map((value, index) => <td key={`${row.key}-${products[index].id}`}>{value || '—'}</td>)}</tr>)}</tbody></table></div>
  </div>
}
