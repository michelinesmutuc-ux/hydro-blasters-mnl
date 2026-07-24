'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase/client'
import { deleteProductImages, uploadProductImages } from '../../lib/supabase/product-images'
import { ProductImageUploader } from './ProductImageUploader'
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
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([])
  const [loadedImageUrls, setLoadedImageUrls] = useState<string[]>([])
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [isLoadingProduct, setIsLoadingProduct] = useState(mode === 'edit')

  useEffect(() => {
    if (mode !== 'edit') return
    const id = new URLSearchParams(window.location.search).get('id')
    if (!id) {
      setError('Choose a product from the Products list to edit it.')
      setIsLoadingProduct(false)
      return
    }

    async function loadProduct() {
      const { data, error: loadError } = await supabase.from('products').select('id,name,slug,brand,category,price,stock,status,short_description,description,specifications,featured,is_active,image_urls').eq('id', id).single()
      if (loadError || !data) {
        setError(loadError?.message ?? 'The product could not be found.')
        setIsLoadingProduct(false)
        return
      }
      setProductId(data.id)
      setValues({
        name: data.name,
        slug: data.slug,
        brand: data.brand ?? '',
        category: data.category,
        price: String(data.price),
        stock: String(data.stock),
        status: data.status,
        shortDescription: data.short_description ?? '',
        description: data.description ?? '',
        specifications: JSON.stringify(data.specifications ?? {}, null, 2),
        featured: data.featured,
        isActive: data.is_active,
      })
      setSlugEdited(true)
      setExistingImageUrls(data.image_urls ?? [])
      setLoadedImageUrls(data.image_urls ?? [])
      setIsLoadingProduct(false)
    }
    loadProduct()
  }, [mode])

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function handleNameChange(name: string) {
    update('name', name)
    if (!slugEdited) update('slug', slugify(name))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    let specificationsObject: Record<string, unknown> = {}
    if (values.specifications.trim()) {
      try {
        const parsed: unknown = JSON.parse(values.specifications)
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error()
        specificationsObject = parsed as Record<string, unknown>
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
    if (mode === 'edit' && !productId) {
      setError('The product could not be identified. Return to the Products list and try again.')
      return
    }

    setIsSaving(true)
    setUploadProgress(imageFiles.length ? { completed: 0, total: imageFiles.length } : null)

    try {
      const uploadedImageUrls: string[] = imageFiles.length
        ? await uploadProductImages({
          files: imageFiles,
          slug: values.slug.trim(),
          onProgress: (completed, total) => setUploadProgress({ completed, total }),
        })
        : []
      if (imageFiles.length > 0 && uploadedImageUrls.length === 0) {
        throw new Error('Your images uploaded, but no public image URLs were returned. The product was not saved.')
      }
      if (uploadedImageUrls.length !== imageFiles.length) {
        throw new Error('Not every selected image returned a public URL. The product was not saved.')
      }
      const productPayload = {
        name: values.name.trim(),
        slug: values.slug.trim(),
        brand: values.brand.trim() || null,
        category: values.category,
        price,
        stock,
        status: values.status,
        short_description: values.shortDescription.trim() || null,
        description: values.description.trim() || null,
        specifications: specificationsObject,
        image_urls: uploadedImageUrls,
        featured: values.featured,
        is_active: values.isActive,
      }

      if (mode === 'add') {
        console.log('[Hydro Blasters MNL] Final image_urls payload sent to Supabase:', productPayload.image_urls)
        const { data, error: insertError } = await supabase
          .from('products')
          .insert(productPayload)
          .select('id, image_urls')
          .single()
        if (insertError) throw insertError
        const savedUrls: string[] = Array.isArray(data?.image_urls) ? data.image_urls : []
        if (uploadedImageUrls.length > 0 && (savedUrls.length === 0 || savedUrls.length !== uploadedImageUrls.length || savedUrls.some((url, index) => url !== uploadedImageUrls[index]))) {
          throw new Error('The product was saved, but its uploaded image URLs were not returned by Supabase. The form has not been marked as successful.')
        }
        router.push('/admin/products?created=1')
        return
      }

      const editPayload = { ...productPayload, image_urls: [...existingImageUrls, ...uploadedImageUrls] }
      const removedImageUrls = loadedImageUrls.filter((url) => !existingImageUrls.includes(url))
      console.log('[Hydro Blasters MNL] Final image_urls payload sent to Supabase:', editPayload.image_urls)
      const { data, error: updateError } = await supabase.from('products').update({ ...editPayload, updated_at: new Date().toISOString() }).eq('id', productId as string).select('id,image_urls').single()
      if (updateError) throw updateError
      const savedUrls: string[] = Array.isArray(data?.image_urls) ? data.image_urls : []
      if (editPayload.image_urls.length > 0 && (savedUrls.length === 0 || savedUrls.length !== editPayload.image_urls.length || savedUrls.some((url, index) => url !== editPayload.image_urls[index]))) {
        throw new Error('The product was saved, but its uploaded image URLs were not returned by Supabase. The form has not been marked as successful.')
      }
      await deleteProductImages(removedImageUrls)
      router.push('/admin/products?updated=1')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The product could not be saved. Please try again.')
    } finally {
      setIsSaving(false)
      setUploadProgress(null)
    }
  }

  if (isLoadingProduct) return <p className={styles.emptyState}>Loading product…</p>

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
      <section className={styles.formSection}><h2>Product images</h2><ProductImageUploader files={imageFiles} onFilesChange={setImageFiles} existingImageUrls={existingImageUrls} onExistingImageUrlsChange={setExistingImageUrls} disabled={isSaving} progress={uploadProgress} /></section>
      <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={() => router.push('/admin/products')}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={isSaving}>{isSaving ? 'Saving…' : mode === 'add' ? 'Save product' : 'Save changes'}</button></div>
    </form>
  )
}
