'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase/client'
import { deleteProductImages } from '../../lib/supabase/product-images'
import { fetchAdminProducts } from '../../lib/supabase/products'
import { markWebsiteChangesUnpublished } from '../../lib/admin/publishing'
import { requireAdminSession } from '../../lib/admin/auth'
import styles from './admin.module.css'

type Product = {
  id: string
  name: string
  brand: string | null
  category: string
  price: number | string
  stock: number
  status: 'draft' | 'in_stock' | 'out_of_stock' | 'preorder'
  featured: boolean
  is_active: boolean
  image_urls: string[]
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
  const stockSaveLock = useRef<string | null>(null)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await fetchAdminProducts()
    if (queryError) setError(queryError.message)
    else {
      setProducts((data ?? []) as Product[])
      setError(null)
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

  function stockStatus(stock: number) {
    if (stock >= 5) return { label: 'In Stock', tone: styles.stockHealthy }
    if (stock >= 3) return { label: 'Low Stock', tone: styles.stockLow }
    if (stock >= 1) return { label: 'Very Low Stock', tone: styles.stockVeryLow }
    return { label: 'Out of Stock', tone: styles.stockOut }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}><h2>All products</h2><span>{loading ? 'Loading products…' : `${products.length} product${products.length === 1 ? '' : 's'}`}</span></div>
      {notice && <p className={styles.successMessage} role="status">{notice}</p>}
      {error && <p className={styles.errorMessage} role="alert">{error}</p>}
      {!loading && !error && products.length === 0 && <div className={styles.emptyState}>No products found yet.</div>}
      {!loading && !error && products.length > 0 && <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{products.map((product) => {
        const isWorking = workingId === product.id
        const activeIsUpdating = workingToggle?.id === product.id && workingToggle.field === 'is_active'
        const featuredIsUpdating = workingToggle?.id === product.id && workingToggle.field === 'featured'
        const stockIsSaving = savingStockId === product.id
        const stockInfo = stockStatus(product.stock)
        const stockDraft = stockDrafts[product.id] ?? String(product.stock)
        return <tr key={product.id}><td>{product.image_urls[0] ? <img className={styles.tableImage} src={product.image_urls[0]} alt="" /> : <div className={styles.thumbnail}>Image</div>}</td><td>{product.name}</td><td className={styles.placeholderText}>{product.brand ?? '—'}</td><td>{product.category}</td><td>{product.price}</td><td><div className={styles.stockControl}><div><button type="button" aria-label={`Decrease ${product.name} stock`} disabled={stockIsSaving || product.stock === 0} onClick={() => void saveStock(product, String(product.stock - 1))}>−</button><input aria-label={`${product.name} stock`} inputMode="numeric" pattern="[0-9]*" value={stockDraft} disabled={stockIsSaving} onChange={(event) => setStockDrafts((current) => ({ ...current, [product.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveStock(product, stockDraft) } if (event.key === 'Escape') { event.preventDefault(); setStockDrafts((current) => ({ ...current, [product.id]: String(product.stock) })); event.currentTarget.blur() } }} onBlur={() => { if (stockDraft !== String(product.stock)) void saveStock(product, stockDraft) }} /><button type="button" aria-label={`Increase ${product.name} stock`} disabled={stockIsSaving} onClick={() => void saveStock(product, String(product.stock + 1))}>+</button></div><span className={stockInfo.tone}>{stockIsSaving ? 'Saving…' : stockInfo.label}</span></div></td><td><span className={styles.status}>{statusLabel(product.status)}</span></td><td><button type="button" className={`${styles.quickToggle} ${product.is_active ? styles.quickToggleOn : ''}`} aria-pressed={product.is_active} aria-label={`Set ${product.name} ${product.is_active ? 'inactive' : 'active'}`} disabled={isWorking || activeIsUpdating} onClick={() => toggleProductField(product, 'is_active')}><span aria-hidden="true" />{activeIsUpdating ? 'Saving…' : product.is_active ? 'Active' : 'Inactive'}</button></td><td><button type="button" className={`${styles.quickToggle} ${product.featured ? styles.quickToggleOn : ''}`} aria-pressed={product.featured} aria-label={`${product.featured ? 'Remove' : 'Set'} ${product.name} as featured`} disabled={isWorking || featuredIsUpdating} onClick={() => toggleProductField(product, 'featured')}><span aria-hidden="true" />{featuredIsUpdating ? 'Saving…' : product.featured ? 'Featured' : 'Not featured'}</button></td><td><div className={styles.tableActions}><a className={styles.tableAction} href={`/admin/products/edit?id=${product.id}`}>Edit</a><button className={styles.tableAction} type="button" disabled={isWorking} onClick={() => duplicateProduct(product)}>{isWorking ? 'Working…' : 'Duplicate'}</button><button className={`${styles.tableAction} ${styles.deleteAction}`} type="button" disabled={isWorking} onClick={() => deleteProduct(product)}>{isWorking ? 'Working…' : 'Delete'}</button></div></td></tr>
      })}</tbody></table></div>}
    </section>
  )
}
