'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase/client'
import styles from './admin.module.css'

type ProductFormProps = { mode: 'add' | 'edit' }

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_stock', label: 'In Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'preorder', label: 'Pre-order' },
]

const categoryOptions = ['Gel Blaster', 'Pistol', 'Parts', 'Accessories', 'Batteries and Chargers', 'Tactical Gear', 'Other']

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function initialValues() {
  return { name: '', slug: '', brand: '', category: '', price: '0', stock: '0', status: 'draft', shortDescription: '', description: '', specifications: '', featured: false, isActive: false }
}

export function ProductForm({ mode }: ProductFormProps) {
  const router = useRouter()
  const [values, setValues] = useState(initialValues)
  const [slugEdited, setSlugEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function handleNameChange(name: string) {
    update('name', name)
    if (!slugEdited) update('slug', slugify(name))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mode === 'edit') {
      setError('Editing products will be connected in a future step.')
      return
    }

    setError(null)
    let specifications: Record<string, unknown> = {}
    if (values.specifications.trim()) {
      try {
        const parsed: unknown = JSON.parse(values.specifications)
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error()
        specifications = parsed as Record<string, unknown>
      } catch {
        setError('Product specifications must be a valid JSON object.')
        return
      }
    }

    const price = Number(values.price)
    const stock = Number(values.stock)
    if (!values.name.trim() || !values.slug.trim() || !values.category || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
      setError('Please complete the required fields with a valid non-negative price and whole-number stock value.')
      return
    }

    setIsSaving(true)
    const { error: insertError } = await supabase.from('products').insert({
      name: values.name.trim(),
      slug: values.slug.trim(),
      brand: values.brand.trim() || null,
      category: values.category,
      price,
      stock,
      status: values.status,
      short_description: values.shortDescription.trim() || null,
      description: values.description.trim() || null,
      specifications,
      image_urls: [],
      featured: values.featured,
      is_active: values.isActive,
    })
    setIsSaving(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    router.push('/admin/products?created=1')
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && <p className={styles.errorMessage} role="alert">{error}</p>}
      <section className={styles.formSection}>
        <h2>Product information</h2>
        <div className={styles.fieldGrid}>
          <div className={styles.field}><label htmlFor="product-name">Product Name</label><input id="product-name" required value={values.name} onChange={(event) => handleNameChange(event.target.value)} placeholder="Enter product name" /></div>
          <div className={styles.field}><label htmlFor="product-slug">Slug</label><input id="product-slug" required value={values.slug} onChange={(event) => { setSlugEdited(true); update('slug', event.target.value) }} placeholder="product-slug" /><span className={styles.slugHint}>Generated from the name until you edit it.</span></div>
          <div className={styles.field}><label htmlFor="brand">Brand</label><input id="brand" value={values.brand} onChange={(event) => update('brand', event.target.value)} placeholder="Brand name" /></div>
          <div className={styles.field}><label htmlFor="category">Category</label><select id="category" required value={values.category} onChange={(event) => update('category', event.target.value)}><option value="" disabled>Select a category</option>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>
          <div className={styles.field}><label htmlFor="price">Price</label><input id="price" required min="0" step="0.01" type="number" value={values.price} onChange={(event) => update('price', event.target.value)} /></div>
          <div className={styles.field}><label htmlFor="stock">Stock</label><input id="stock" required min="0" step="1" type="number" value={values.stock} onChange={(event) => update('stock', event.target.value)} /></div>
          <div className={styles.field}><label htmlFor="status">Status</label><select id="status" value={values.status} onChange={(event) => update('status', event.target.value)}>{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></div>
          <div className={styles.toggleRow}>
            <label className={styles.toggle}><span><strong>Featured</strong><span>Set featured status</span></span><input className={styles.switch} type="checkbox" checked={values.featured} onChange={(event) => update('featured', event.target.checked)} /></label>
            <label className={styles.toggle}><span><strong>Active</strong><span>Set active status</span></span><input className={styles.switch} type="checkbox" checked={values.isActive} onChange={(event) => update('isActive', event.target.checked)} /></label>
          </div>
          <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="short-description">Short Description</label><textarea id="short-description" value={values.shortDescription} onChange={(event) => update('shortDescription', event.target.value)} placeholder="Short product description" /></div>
          <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="description">Full Description</label><textarea id="description" value={values.description} onChange={(event) => update('description', event.target.value)} placeholder="Full product description" /></div>
          <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="specifications">Product Specifications</label><textarea id="specifications" value={values.specifications} onChange={(event) => update('specifications', event.target.value)} placeholder='Optional JSON object, for example { "color": "black" }' /><span className={styles.slugHint}>Leave blank to save an empty JSON object.</span></div>
        </div>
      </section>
      <section className={styles.formSection}><h2>Product images</h2><div className={styles.uploadPlaceholder}>Image upload will be connected later. New products currently save with an empty image list.</div></section>
      <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={() => router.push('/admin/products')}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={isSaving}>{isSaving ? 'Saving…' : mode === 'add' ? 'Save product' : 'Save changes'}</button></div>
    </form>
  )
}
