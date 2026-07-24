'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { deleteProductImages } from '../../lib/supabase/product-images'
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
  image_urls: string[]
}

type ProductForDuplicate = Product & {
  slug: string
  short_description: string | null
  description: string | null
  specifications: Record<string, unknown>
  is_active: boolean
}

const columns = ['Thumbnail', 'Product Name', 'Brand', 'Category', 'Price', 'Stock', 'Status', 'Featured', 'Actions']

function statusLabel(status: Product['status']) {
  return status.replaceAll('_', ' ')
}

export function ProductsTable() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [workingId, setWorkingId] = useState<string | null>(null)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase.from('products').select('id,name,brand,category,price,stock,status,featured,image_urls').order('created_at', { ascending: false })
    if (queryError) setError(queryError.message)
    else {
      setProducts((data ?? []) as Product[])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('created') === '1') setNotice('Product saved successfully.')
    if (params.get('updated') === '1') setNotice('Product updated successfully.')
    loadProducts()
  }, [loadProducts])

  async function nextCopySlug(sourceSlug: string) {
    const baseSlug = `${sourceSlug}-copy`
    let candidate = baseSlug
    let copyNumber = 2
    while (true) {
      const { data, error: queryError } = await supabase.from('products').select('id').eq('slug', candidate).limit(1)
      if (queryError) throw queryError
      if (!data?.length) return candidate
      candidate = `${baseSlug}-${copyNumber}`
      copyNumber += 1
    }
  }

  async function duplicateProduct(product: Product) {
    setWorkingId(product.id)
    setError(null)
    setNotice(null)
    try {
      const { data: source, error: sourceError } = await supabase.from('products').select('name,slug,brand,category,price,stock,status,short_description,description,specifications,image_urls,featured,is_active').eq('id', product.id).single()
      if (sourceError || !source) throw sourceError ?? new Error('The product could not be found.')
      const newSlug = await nextCopySlug(source.slug)
      const duplicate: ProductForDuplicate = { ...source, id: product.id }
      const { error: insertError } = await supabase.from('products').insert({
        name: `${duplicate.name} (Copy)`,
        slug: newSlug,
        brand: duplicate.brand,
        category: duplicate.category,
        price: duplicate.price,
        stock: duplicate.stock,
        status: duplicate.status,
        short_description: duplicate.short_description,
        description: duplicate.description,
        specifications: duplicate.specifications,
        image_urls: duplicate.image_urls,
        featured: duplicate.featured,
        is_active: duplicate.is_active,
      })
      if (insertError) throw insertError
      setNotice('Product duplicated successfully.')
      await loadProducts()
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : 'The product could not be duplicated.')
    } finally {
      setWorkingId(null)
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Delete “${product.name}”? This will permanently remove the product and its uploaded images.`)) return
    setWorkingId(product.id)
    setError(null)
    setNotice(null)
    try {
      const { error: deleteError } = await supabase.from('products').delete().eq('id', product.id)
      if (deleteError) throw deleteError
      const { data: remainingProducts, error: remainingError } = await supabase.from('products').select('image_urls')
      if (remainingError) throw remainingError
      const stillReferenced = new Set((remainingProducts ?? []).flatMap((remainingProduct) => Array.isArray(remainingProduct.image_urls) ? remainingProduct.image_urls : []))
      await deleteProductImages(product.image_urls.filter((url) => !stillReferenced.has(url)))
      setNotice('Product and its uploaded images were deleted.')
      await loadProducts()
    } catch (deleteError) {
      await loadProducts()
      setError(deleteError instanceof Error ? deleteError.message : 'The product could not be deleted.')
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}><h2>All products</h2><span>{loading ? 'Loading products…' : `${products.length} product${products.length === 1 ? '' : 's'}`}</span></div>
      {notice && <p className={styles.successMessage} role="status">{notice}</p>}
      {error && <p className={styles.errorMessage} role="alert">{error}</p>}
      {!loading && !error && products.length === 0 && <div className={styles.emptyState}>No products found yet.</div>}
      {!loading && !error && products.length > 0 && <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{products.map((product) => {
        const isWorking = workingId === product.id
        return <tr key={product.id}><td>{product.image_urls[0] ? <img className={styles.tableImage} src={product.image_urls[0]} alt="" /> : <div className={styles.thumbnail}>Image</div>}</td><td>{product.name}</td><td className={styles.placeholderText}>{product.brand ?? '—'}</td><td>{product.category}</td><td>{product.price}</td><td>{product.stock}</td><td><span className={styles.status}>{statusLabel(product.status)}</span></td><td>{product.featured ? 'Yes' : 'No'}</td><td><div className={styles.tableActions}><a className={styles.tableAction} href={`/admin/products/edit?id=${product.id}`}>Edit</a><button className={styles.tableAction} type="button" disabled={isWorking} onClick={() => duplicateProduct(product)}>{isWorking ? 'Working…' : 'Duplicate'}</button><button className={`${styles.tableAction} ${styles.deleteAction}`} type="button" disabled={isWorking} onClick={() => deleteProduct(product)}>{isWorking ? 'Working…' : 'Delete'}</button></div></td></tr>
      })}</tbody></table></div>}
    </section>
  )
}
