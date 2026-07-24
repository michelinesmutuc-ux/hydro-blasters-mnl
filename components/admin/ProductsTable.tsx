'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
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

const columns = ['Thumbnail', 'Product Name', 'Brand', 'Category', 'Price', 'Stock', 'Status', 'Featured', 'Actions']

function statusLabel(status: Product['status']) {
  return status.replaceAll('_', ' ')
}

export function ProductsTable() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)

  useEffect(() => {
    setCreated(new URLSearchParams(window.location.search).get('created') === '1')
    async function loadProducts() {
      const { data, error: queryError } = await supabase.from('products').select('id,name,brand,category,price,stock,status,featured,image_urls').order('created_at', { ascending: false })
      if (queryError) setError(queryError.message)
      else setProducts((data ?? []) as Product[])
      setLoading(false)
    }
    loadProducts()
  }, [])

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}><h2>All products</h2><span>{loading ? 'Loading products…' : `${products.length} product${products.length === 1 ? '' : 's'}`}</span></div>
      {created && <p className={styles.successMessage} role="status">Product saved successfully.</p>}
      {error && <p className={styles.errorMessage} role="alert">Could not load products: {error}</p>}
      {!loading && !error && products.length === 0 && <div className={styles.emptyState}>No products found yet.</div>}
      {!loading && !error && products.length > 0 && <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{products.map((product) => <tr key={product.id}><td>{product.image_urls[0] ? <img className={styles.tableImage} src={product.image_urls[0]} alt="" /> : <div className={styles.thumbnail}>Image</div>}</td><td>{product.name}</td><td className={styles.placeholderText}>{product.brand ?? '—'}</td><td>{product.category}</td><td>{product.price}</td><td>{product.stock}</td><td><span className={styles.status}>{statusLabel(product.status)}</span></td><td>{product.featured ? 'Yes' : 'No'}</td><td><span className={styles.placeholderText}>Coming soon</span></td></tr>)}</tbody></table></div>}
    </section>
  )
}
