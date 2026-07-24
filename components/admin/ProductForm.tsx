'use client'

import { useState } from 'react'
import styles from './admin.module.css'

type ProductFormProps = {
  mode: 'add' | 'edit'
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function ProductForm({ mode }: ProductFormProps) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  function handleNameChange(value: string) {
    setName(value)
    if (!slugEdited) setSlug(slugify(value))
  }

  return (
    <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
      <section className={styles.formSection}>
        <h2>Product information</h2>
        <div className={styles.fieldGrid}>
          <div className={styles.field}><label htmlFor="product-name">Product name</label><input id="product-name" value={name} onChange={(event) => handleNameChange(event.target.value)} placeholder="Enter product name" /></div>
          <div className={styles.field}><label htmlFor="product-slug">Slug</label><input id="product-slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(event.target.value) }} placeholder="product-slug" /><span className={styles.slugHint}>Generated from the name until you edit it.</span></div>
          <div className={styles.field}><label htmlFor="brand">Brand</label><input id="brand" placeholder="Brand name" /></div>
          <div className={styles.field}><label htmlFor="category">Category</label><select id="category" defaultValue=""><option value="" disabled>Select a category</option><option>Gel Blasters</option><option>Accessories</option><option>Magazines</option><option>Batteries</option></select></div>
          <div className={styles.field}><label htmlFor="price">Price</label><input id="price" inputMode="decimal" placeholder="Price" /></div>
          <div className={styles.field}><label htmlFor="stock">Stock</label><input id="stock" inputMode="numeric" placeholder="Stock quantity" /></div>
          <div className={styles.field}><label htmlFor="status">Status</label><select id="status" defaultValue="Draft"><option>Draft</option><option>In Stock</option><option>Out of Stock</option><option>Pre-order</option></select></div>
          <div className={styles.toggleRow}>
            <label className={styles.toggle}><span><strong>Featured</strong><span>Show when enabled</span></span><input className={styles.switch} type="checkbox" /></label>
            <label className={styles.toggle}><span><strong>Active</strong><span>Visible when enabled</span></span><input className={styles.switch} type="checkbox" /></label>
          </div>
          <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="short-description">Short description</label><textarea id="short-description" placeholder="Short product description" /></div>
          <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="full-description">Full description</label><textarea id="full-description" placeholder="Full product description" /></div>
          <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="specifications">Product specifications</label><textarea id="specifications" placeholder="Product specifications" /></div>
        </div>
      </section>
      <section className={styles.formSection}>
        <h2>Product images</h2>
        <div className={styles.uploadPlaceholder}>Image upload will be connected later.</div>
      </section>
      <div className={styles.formActions}><button type="button" className={styles.secondaryButton}>Cancel</button><button type="submit" className={styles.primaryButton}>{mode === 'add' ? 'Save product later' : 'Save changes later'}</button></div>
    </form>
  )
}
