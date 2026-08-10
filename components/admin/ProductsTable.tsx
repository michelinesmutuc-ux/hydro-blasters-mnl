'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase/client'
import { deleteProductImages } from '../../lib/supabase/product-images'
import { fetchAdminProducts } from '../../lib/supabase/products'
import { markWebsiteChangesUnpublished } from '../../lib/admin/publishing'
import { requireAdminSession } from '../../lib/admin/auth'
import { GEL_BLASTER_TYPES, gelBlasterTypeFilterLabels, isGelBlasterCategory, type GelBlasterType } from '../../lib/products/product-types'
import styles from './admin.module.css'

type Product = {
  id: string
  name: string
  slug: string
  brand: string | null
  category: string
  product_type: string | null
  price: number | string
  stock: number
  status: 'draft' | 'in_stock' | 'out_of_stock' | 'preorder'
  featured: boolean
  is_active: boolean
  image_urls: string[]
  has_variants: boolean
  created_at: string
  updated_at: string | null
}

type ProductFilters = {
  search: string
  category: string
  productType: GelBlasterType | ''
  publication: 'all' | 'published' | 'inactive'
  stock: 'all' | 'in-stock' | 'low-stock' | 'out-of-stock'
  sort: 'newest' | 'updated' | 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc'
}

const columns = ['Thumbnail', 'Product Name', 'Brand', 'Category', 'Price', 'Stock', 'Status', 'Active', 'Featured', 'Actions']

function statusLabel(status: Product['status']) {
  return status.replaceAll('_', ' ')
}

export function ProductsTable() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [workingToggle, setWorkingToggle] = useState<{ id: string; field: 'is_active' | 'featured' } | null>(null)
  const [savingStockId, setSavingStockId] = useState<string | null>(null)
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({})
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null)
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})
  const [variantCounts, setVariantCounts] = useState<Record<string, number>>({})
  const [variantSkus, setVariantSkus] = useState<Record<string, string[]>>({})
  const [filters, setFilters] = useState<ProductFilters>({ search: '', category: '', productType: '', publication: 'all', stock: 'all', sort: 'newest' })
  const stockSaveLock = useRef<string | null>(null)
  const priceSaveLock = useRef<string | null>(null)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await fetchAdminProducts()
    if (queryError) setError(queryError.message)
    else {
      setProducts((data ?? []) as Product[])
      const productIds = (data ?? []).map((product) => product.id)
      let variantLoadError: string | null = null
      if (productIds.length > 0) {
        const { data: variantRows, error: variantError } = await supabase
          .from('product_variants')
          .select('product_id,sku')
          .in('product_id', productIds)
        if (variantError) variantLoadError = variantError.message
        else {
          setVariantCounts((variantRows ?? []).reduce<Record<string, number>>((counts, row) => {
            counts[row.product_id] = (counts[row.product_id] ?? 0) + 1
            return counts
          }, {}))
          setVariantSkus((variantRows ?? []).reduce<Record<string, string[]>>((skus, row) => {
            if (row.sku?.trim()) skus[row.product_id] = [...(skus[row.product_id] ?? []), row.sku]
            return skus
          }, {}))
        }
      } else {
        setVariantCounts({})
        setVariantSkus({})
      }
      setError(variantLoadError)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('created') === '1') setNotice('Product saved successfully. ⚠️ You have unpublished website changes.')
    if (params.get('updated') === '1') setNotice('Product updated successfully. ⚠️ You have unpublished website changes.')
    loadProducts()
    function refreshUpdatedProduct() {
      try {
        const stored = window.localStorage.getItem('hydro-products-updated')
        const updatedProduct = stored ? JSON.parse(stored).product as Product | undefined : undefined
        if (updatedProduct) setProducts((current) => current.map((product) => product.id === updatedProduct.id ? updatedProduct : product))
      } catch {
        // A fresh query below remains the source of truth if the signal cannot be read.
      }
      loadProducts()
    }
    window.addEventListener('hydro-products-updated', refreshUpdatedProduct)
    window.addEventListener('storage', loadProducts)
    return () => {
      window.removeEventListener('hydro-products-updated', refreshUpdatedProduct)
      window.removeEventListener('storage', loadProducts)
    }
  }, [loadProducts])

  function duplicateProduct(product: Product) {
    router.push(`/admin/products/new?duplicateFrom=${encodeURIComponent(product.id)}`)
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Delete “${product.name}”? This will permanently remove the product and its uploaded images.`)) return
    setWorkingId(product.id)
    setError(null)
    setNotice(null)
    try {
      await requireAdminSession()
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .eq('id', product.id)
      if (deleteError) throw deleteError
      markWebsiteChangesUnpublished()
      let cleanupWarning: string | null = null
      try {
        const { data: remainingProducts, error: remainingError } = await supabase.from('products').select('image_urls')
        if (remainingError) throw remainingError
        const stillReferenced = new Set((remainingProducts ?? []).flatMap((remainingProduct) => Array.isArray(remainingProduct.image_urls) ? remainingProduct.image_urls : []))
        await deleteProductImages(product.image_urls.filter((url) => !stillReferenced.has(url)))
      } catch (cleanupError) {
        cleanupWarning = cleanupError instanceof Error ? cleanupError.message : 'Storage cleanup could not be completed.'
      }
      setNotice(cleanupWarning ? `Product row deleted. Warning: ${cleanupWarning}` : 'Product and its uploaded images were deleted.')
      await loadProducts()
    } catch (deleteError) {
      await loadProducts()
      setError(deleteError instanceof Error ? deleteError.message : 'The product could not be deleted.')
    } finally {
      setWorkingId(null)
    }
  }

  async function toggleProductField(product: Product, field: 'is_active' | 'featured') {
    const previousValue = product[field]
    const nextValue = !previousValue
    setWorkingToggle({ id: product.id, field })
    setError(null)
    setProducts((current) => current.map((currentProduct) => currentProduct.id === product.id ? { ...currentProduct, [field]: nextValue } : currentProduct))

    try {
      await requireAdminSession()
    } catch (authError) {
      setProducts((current) => current.map((currentProduct) => currentProduct.id === product.id ? { ...currentProduct, [field]: previousValue } : currentProduct))
      setError(authError instanceof Error ? authError.message : 'Administrator access is required.')
      setWorkingToggle(null)
      return
    }

    const { error: updateError } = await supabase
      .from('products')
      .update({ [field]: nextValue, updated_at: new Date().toISOString() })
      .eq('id', product.id)

    if (updateError) {
      setProducts((current) => current.map((currentProduct) => currentProduct.id === product.id ? { ...currentProduct, [field]: previousValue } : currentProduct))
      setError(`Could not update ${field === 'is_active' ? 'Active' : 'Featured'} for ${product.name}. ${updateError.message}`)
    } else {
      markWebsiteChangesUnpublished()
    }
    setWorkingToggle(null)
  }

  async function saveStock(product: Product, draft: string) {
    if (savingStockId === product.id || stockSaveLock.current === product.id) return
    if (!/^\d+$/.test(draft)) {
      setStockDrafts((current) => ({ ...current, [product.id]: String(product.stock) }))
      setError('Stock must be a whole number of zero or more.')
      return
    }
    const nextStock = Number(draft)
    if (!Number.isSafeInteger(nextStock) || nextStock < 0) {
      setStockDrafts((current) => ({ ...current, [product.id]: String(product.stock) }))
      setError('Stock must be a whole number of zero or more.')
      return
    }
    if (nextStock === product.stock) {
      setStockDrafts((current) => ({ ...current, [product.id]: String(product.stock) }))
      return
    }

    stockSaveLock.current = product.id
    setSavingStockId(product.id)
    setError(null)
    setNotice(null)
    try {
      await requireAdminSession()
      const { data, error: updateError } = await supabase
        .from('products')
        .update({ stock: nextStock, updated_at: new Date().toISOString() })
        .eq('id', product.id)
        .select('id,stock')
        .single()
      if (updateError || !data) throw updateError ?? new Error('Stock update did not return a product.')
      setProducts((current) => current.map((currentProduct) => currentProduct.id === product.id ? { ...currentProduct, stock: data.stock } : currentProduct))
      setStockDrafts((current) => ({ ...current, [product.id]: String(data.stock) }))
      markWebsiteChangesUnpublished()
      setNotice('Stock saved. Publish the website to update the public storefront.')
    } catch (caught) {
      setStockDrafts((current) => ({ ...current, [product.id]: String(product.stock) }))
      setError(`Stock for ${product.name} was not saved. ${caught instanceof Error ? caught.message : 'Please try again.'}`)
    } finally {
      stockSaveLock.current = null
      setSavingStockId(null)
    }
  }

  function formatPrice(value: number | string) {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value))
  }

  function startEditingPrice(product: Product) {
    setError(null)
    setNotice(null)
    setPriceDrafts((current) => ({ ...current, [product.id]: String(Number(product.price)) }))
    setEditingPriceId(product.id)
  }

  function cancelEditingPrice(product: Product) {
    setPriceDrafts((current) => ({ ...current, [product.id]: String(Number(product.price)) }))
    setEditingPriceId(null)
    setError(null)
  }

  async function savePrice(product: Product, draft: string) {
    if (savingPriceId === product.id || priceSaveLock.current === product.id) return
    if (!/^\d+(?:\.\d{0,2})?$/.test(draft)) {
      setError('Price must be a non-negative number with no more than two decimal places.')
      return
    }

    const nextPrice = Number(draft)
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      setError('Price must be a non-negative number with no more than two decimal places.')
      return
    }
    if (nextPrice === Number(product.price)) {
      cancelEditingPrice(product)
      return
    }

    priceSaveLock.current = product.id
    setSavingPriceId(product.id)
    setError(null)
    setNotice(null)
    try {
      await requireAdminSession()
      const { data, error: updateError } = await supabase
        .from('products')
        .update({ price: nextPrice, updated_at: new Date().toISOString() })
        .eq('id', product.id)
        .select('id,price')
        .single()
      if (updateError || !data) throw updateError ?? new Error('Price update did not return a product.')
      setProducts((current) => current.map((currentProduct) => currentProduct.id === product.id ? { ...currentProduct, price: data.price } : currentProduct))
      setPriceDrafts((current) => ({ ...current, [product.id]: String(data.price) }))
      setEditingPriceId(null)
      markWebsiteChangesUnpublished()
      setNotice('Price saved. Publish the website to update the public storefront.')
    } catch (caught) {
      setError(`Price for ${product.name} was not saved. ${caught instanceof Error ? caught.message : 'Please try again.'}`)
    } finally {
      priceSaveLock.current = null
      setSavingPriceId(null)
    }
  }

  function stockStatus(stock: number) {
    if (stock >= 5) return { label: 'In Stock', tone: styles.stockHealthy }
    if (stock >= 3) return { label: 'Low Stock', tone: styles.stockLow }
    if (stock >= 1) return { label: 'Very Low Stock', tone: styles.stockVeryLow }
    return { label: 'Out of Stock', tone: styles.stockOut }
  }

  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category))).sort((first, second) => first.localeCompare(second)), [products])
  const visibleProducts = useMemo(() => {
    const query = filters.search.trim().toLocaleLowerCase()
    const filtered = products.filter((product) => {
      const matchesSearch = !query || [product.name, product.brand ?? '', product.slug, ...(variantSkus[product.id] ?? [])]
        .some((value) => value.toLocaleLowerCase().includes(query))
      const matchesCategory = !filters.category || product.category === filters.category
      const matchesType = !filters.productType || product.product_type === filters.productType
      const matchesPublication = filters.publication === 'all' || (filters.publication === 'published' ? product.is_active : !product.is_active)
      const matchesStock = filters.stock === 'all'
        || (filters.stock === 'in-stock' && product.stock >= 5)
        || (filters.stock === 'low-stock' && product.stock >= 1 && product.stock <= 4)
        || (filters.stock === 'out-of-stock' && product.stock === 0)
      return matchesSearch && matchesCategory && matchesType && matchesPublication && matchesStock
    })

    return [...filtered].sort((first, second) => {
      if (filters.sort === 'updated') return new Date(second.updated_at ?? second.created_at).getTime() - new Date(first.updated_at ?? first.created_at).getTime()
      if (filters.sort === 'name-asc') return first.name.localeCompare(second.name)
      if (filters.sort === 'name-desc') return second.name.localeCompare(first.name)
      if (filters.sort === 'price-asc') return Number(first.price) - Number(second.price)
      if (filters.sort === 'price-desc') return Number(second.price) - Number(first.price)
      return new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
    })
  }, [filters, products, variantSkus])

  function updateFilter<K extends keyof ProductFilters>(field: K, value: ProductFilters[K]) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  function updateCategoryFilter(category: string) {
    setFilters((current) => ({ ...current, category, productType: isGelBlasterCategory(category) ? current.productType : '' }))
  }

  function clearFilters() {
    setFilters({ search: '', category: '', productType: '', publication: 'all', stock: 'all', sort: 'newest' })
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}><h2>All products</h2><span>{loading ? 'Loading products…' : `${visibleProducts.length} of ${products.length} product${products.length === 1 ? '' : 's'}`}</span></div>
      {notice && <p className={styles.successMessage} role="status">{notice}</p>}
      {error && <p className={styles.errorMessage} role="alert">{error}</p>}
      {!loading && !error && products.length === 0 && <div className={styles.emptyState}>No products found yet.</div>}
      {!loading && !error && products.length > 0 && <>
        <div className={styles.productFilterToolbar} aria-label="Search and filter products">
          <label className={styles.productSearch} htmlFor="admin-product-search">Search Products<input id="admin-product-search" type="search" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search products..." /></label>
          <div className={styles.productFilterGrid}>
            <label>Category<select value={filters.category} onChange={(event) => updateCategoryFilter(event.target.value)}><option value="">All Categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
            {isGelBlasterCategory(filters.category) && <label>Type<select value={filters.productType} onChange={(event) => updateFilter('productType', event.target.value as GelBlasterType | '')}><option value="">All Types</option>{GEL_BLASTER_TYPES.map((productType) => <option key={productType} value={productType}>{gelBlasterTypeFilterLabels[productType]}</option>)}</select></label>}
            <label>Status<select value={filters.publication} onChange={(event) => updateFilter('publication', event.target.value as ProductFilters['publication'])}><option value="all">All Statuses</option><option value="published">Published</option><option value="inactive">Draft / Inactive</option></select></label>
            <label>Stock<select value={filters.stock} onChange={(event) => updateFilter('stock', event.target.value as ProductFilters['stock'])}><option value="all">All Stock</option><option value="in-stock">In Stock (5+)</option><option value="low-stock">Low Stock (1–4)</option><option value="out-of-stock">Out of Stock</option></select></label>
            <label>Sort<select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value as ProductFilters['sort'])}><option value="newest">Newest Added</option><option value="updated">Recently Updated</option><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="price-asc">Price Low–High</option><option value="price-desc">Price High–Low</option></select></label>
          </div>
          <button type="button" className={styles.clearProductFilters} onClick={clearFilters}>Clear Filters</button>
        </div>
        {visibleProducts.length === 0 ? <div className={styles.emptyState}><div><p>No products found.</p><button type="button" className={styles.tableAction} onClick={clearFilters}>Clear Filters</button></div></div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{visibleProducts.map((product) => {
        const isWorking = workingId === product.id
        const activeIsUpdating = workingToggle?.id === product.id && workingToggle.field === 'is_active'
        const featuredIsUpdating = workingToggle?.id === product.id && workingToggle.field === 'featured'
        const stockIsSaving = savingStockId === product.id
        const priceIsSaving = savingPriceId === product.id
        const priceIsEditing = editingPriceId === product.id
        const stockInfo = stockStatus(product.stock)
        const stockDraft = stockDrafts[product.id] ?? String(product.stock)
        const priceDraft = priceDrafts[product.id] ?? String(Number(product.price))
        return <tr key={product.id}>
          <td>{product.image_urls[0] ? <img className={styles.tableImage} src={product.image_urls[0]} alt="" /> : <div className={styles.thumbnail}>Image</div>}</td>
          <td>{product.name}</td>
          <td className={styles.placeholderText}>{product.brand ?? '—'}</td>
          <td>{product.category}</td>
          <td>{product.has_variants ? <div className={styles.variantPriceSummary}><strong>From {formatPrice(product.price)}</strong><a className={styles.tableAction} href={`/admin/products/edit?id=${product.id}`}>Edit Variant Prices</a></div> : priceIsEditing ? <div className={styles.priceEditor}><input aria-label={`${product.name} price`} type="text" inputMode="decimal" value={priceDraft} disabled={priceIsSaving} onChange={(event) => setPriceDrafts((current) => ({ ...current, [product.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void savePrice(product, priceDraft) } if (event.key === 'Escape') { event.preventDefault(); cancelEditingPrice(product) } }} /><div><button type="button" disabled={priceIsSaving} onClick={() => void savePrice(product, priceDraft)}>{priceIsSaving ? 'Saving…' : 'Save'}</button><button type="button" disabled={priceIsSaving} onClick={() => cancelEditingPrice(product)}>Cancel</button></div></div> : <div className={styles.priceDisplay}><strong>{formatPrice(product.price)}</strong><button type="button" className={styles.priceEditAction} aria-label={`Edit ${product.name} price`} title="Quick edit price" onClick={() => startEditingPrice(product)}>✎</button></div>}</td>
          <td>{product.has_variants ? <div className={styles.variantStockSummary}><span>{variantCounts[product.id] ?? 0} Variant{variantCounts[product.id] === 1 ? '' : 's'}</span><strong>{product.stock} total</strong><a className={styles.tableAction} href={`/admin/products/edit?id=${product.id}`}>Manage Variants</a></div> : <div className={styles.stockControl}><div><button type="button" aria-label={`Decrease ${product.name} stock`} disabled={stockIsSaving || product.stock === 0} onClick={() => void saveStock(product, String(product.stock - 1))}>−</button><input aria-label={`${product.name} stock`} inputMode="numeric" pattern="[0-9]*" value={stockDraft} disabled={stockIsSaving} onChange={(event) => setStockDrafts((current) => ({ ...current, [product.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveStock(product, stockDraft) } if (event.key === 'Escape') { event.preventDefault(); setStockDrafts((current) => ({ ...current, [product.id]: String(product.stock) })); event.currentTarget.blur() } }} onBlur={() => { if (stockDraft !== String(product.stock)) void saveStock(product, stockDraft) }} /><button type="button" aria-label={`Increase ${product.name} stock`} disabled={stockIsSaving} onClick={() => void saveStock(product, String(product.stock + 1))}>+</button></div><span className={stockInfo.tone}>{stockIsSaving ? 'Saving…' : stockInfo.label}</span></div>}</td>
          <td><span className={styles.status}>{statusLabel(product.status)}</span></td>
          <td><button type="button" className={`${styles.quickToggle} ${product.is_active ? styles.quickToggleOn : ''}`} aria-pressed={product.is_active} aria-label={`Set ${product.name} ${product.is_active ? 'inactive' : 'active'}`} disabled={isWorking || activeIsUpdating} onClick={() => toggleProductField(product, 'is_active')}><span aria-hidden="true" />{activeIsUpdating ? 'Saving…' : product.is_active ? 'Active' : 'Inactive'}</button></td>
          <td><button type="button" className={`${styles.quickToggle} ${product.featured ? styles.quickToggleOn : ''}`} aria-pressed={product.featured} aria-label={`${product.featured ? 'Remove' : 'Set'} ${product.name} as featured`} disabled={isWorking || featuredIsUpdating} onClick={() => toggleProductField(product, 'featured')}><span aria-hidden="true" />{featuredIsUpdating ? 'Saving…' : product.featured ? 'Featured' : 'Not featured'}</button></td>
          <td><div className={styles.tableActions}><a className={styles.tableAction} href={`/admin/products/edit?id=${product.id}`}>Edit</a><button className={styles.tableAction} type="button" disabled={isWorking} onClick={() => duplicateProduct(product)}>{isWorking ? 'Working…' : 'Duplicate'}</button><button className={`${styles.tableAction} ${styles.deleteAction}`} type="button" disabled={isWorking} onClick={() => deleteProduct(product)}>{isWorking ? 'Working…' : 'Delete'}</button></div></td>
        </tr>
      })}</tbody></table></div>}
      </>}
    </section>
  )
}
