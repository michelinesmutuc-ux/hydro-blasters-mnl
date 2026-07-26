'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase/client'
import { deleteProductImages, uploadProductImages } from '../../lib/supabase/product-images'
import { markWebsiteChangesUnpublished } from '../../lib/admin/publishing'
import { ProductImageUploader } from './ProductImageUploader'
import styles from './admin.module.css'

type ProductFormProps = { mode: 'add' | 'edit' }
type SpecificationRow = { id: string; label: string; value: string }
type SpecificationPayloadRow = { product_id: string; label: string; value: string; sort_order: number }
type SupabaseError = { message?: string; code?: string; details?: string | null; hint?: string | null }

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
  return { name: '', brand: '', category: '', price: '0', stock: '0', status: 'draft', shortDescription: '', description: '', featured: false, isActive: false }
}

function newSpecificationRow(): SpecificationRow {
  return { id: crypto.randomUUID(), label: '', value: '' }
}

export function ProductForm({ mode }: ProductFormProps) {
  const router = useRouter()
  const [values, setValues] = useState(initialValues)
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([])
  const [loadedImageUrls, setLoadedImageUrls] = useState<string[]>([])
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [isLoadingProduct, setIsLoadingProduct] = useState(mode === 'edit')
  const [specificationRows, setSpecificationRows] = useState<SpecificationRow[]>([])

  useEffect(() => {
    if (mode !== 'edit') return
    const id = new URLSearchParams(window.location.search).get('id')
    if (!id) {
      setError('Choose a product from the Products list to edit it.')
      setIsLoadingProduct(false)
      return
    }

    async function loadProduct() {
      const { data, error: loadError } = await supabase.from('products').select('id,name,slug,brand,category,price,stock,status,short_description,description,featured,is_active,image_urls').eq('id', id).single()
      if (loadError || !data) {
        setError(loadError?.message ?? 'The product could not be found.')
        setIsLoadingProduct(false)
        return
      }
      setProductId(data.id)
      setValues({
        name: data.name,
        brand: data.brand ?? '',
        category: data.category,
        price: String(data.price),
        stock: String(data.stock),
        status: data.status,
        shortDescription: data.short_description ?? '',
        description: data.description ?? '',
        featured: data.featured,
        isActive: data.is_active,
      })
      const { data: specificationData, error: specificationError } = await supabase
        .from('product_specifications')
        .select('id,label,value,sort_order')
        .eq('product_id', data.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (specificationError) {
        setError(`The product loaded, but its specifications could not be loaded. ${specificationError.message}`)
      } else {
        setSpecificationRows((specificationData ?? []).map((row) => ({ id: row.id, label: row.label, value: row.value })))
      }
      setSlug(data.slug)
      const existingUrls = Array.isArray(data.image_urls) ? data.image_urls : []
      setExistingImageUrls(existingUrls)
      setLoadedImageUrls(existingUrls)
      setIsLoadingProduct(false)
    }
    loadProduct()
  }, [mode])

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function handleNameChange(name: string) {
    update('name', name)
    if (mode === 'add' && !slugEdited) setSlug(slugify(name))
  }

  async function uniqueSlugForCreate(baseSlug: string) {
    let candidate = baseSlug
    let suffix = 2

    while (true) {
      const { data, error: slugError } = await supabase.from('products').select('id').eq('slug', candidate).limit(1)
      if (slugError) throw slugError
      if (!data?.length) return candidate
      candidate = `${baseSlug}-${suffix}`
      suffix += 1
    }
  }

  function updateSpecificationRow(id: string, field: 'label' | 'value', value: string) {
    setSpecificationRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row))
  }

  function moveSpecificationRow(index: number, direction: -1 | 1) {
    setSpecificationRows((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      const [row] = next.splice(index, 1)
      next.splice(nextIndex, 0, row)
      return next
    })
  }

  function specificationPayload(targetProductId: string, rows: SpecificationRow[]): SpecificationPayloadRow[] {
    const validRows = rows
      .map((row) => ({ label: row.label.trim(), value: row.value.trim() }))
      .filter((row) => row.label || row.value)

    if (validRows.some((row) => !row.label || !row.value)) {
      throw new Error('Each specification needs both a label and a value, or remove the incomplete row.')
    }
    return validRows.map((row, sort_order) => ({ ...row, product_id: targetProductId, sort_order }))
  }

  function describeSpecificationError(error: unknown, productSaved: boolean) {
    const supabaseError = error as SupabaseError
    console.error('[Hydro Blasters MNL] product_specifications save failed:', {
      message: supabaseError?.message,
      code: supabaseError?.code,
      details: supabaseError?.details,
      hint: supabaseError?.hint,
    })
    const prefix = productSaved ? 'Product saved, but specifications could not be saved. ' : 'Specifications could not be saved. '
    if (supabaseError?.code === 'PGRST205') return `${prefix}Specifications table is not configured yet. Run the required Supabase migration, then retry.`
    if (supabaseError?.code === '42501') return `${prefix}Permission was denied. An authorized administrator needs access to product specifications.`
    return `${prefix}${supabaseError?.message || 'Please try again after checking the Supabase specifications setup.'}`
  }

  async function saveSpecificationRows(targetProductId: string, rows: SpecificationRow[], replaceExisting: boolean) {
    const validRows = specificationPayload(targetProductId, rows)
    if (!replaceExisting && validRows.length === 0) return
    const { error: deleteError } = await supabase.from('product_specifications').delete().eq('product_id', targetProductId)
    if (deleteError) {
      console.error('[Hydro Blasters MNL] product_specifications delete failed:', deleteError)
      throw deleteError
    }
    if (validRows.length === 0) return

    const { error: insertError } = await supabase.from('product_specifications').insert(validRows)
    if (insertError) {
      console.error('[Hydro Blasters MNL] product_specifications insert failed:', insertError)
      throw insertError
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const normalizedSlug = slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const price = Number(values.price)
    const stock = Number(values.stock)
    if (!values.name.trim() || (mode === 'add' && !normalizedSlug) || !values.category || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
      setError('Please complete the required fields with a valid non-negative price and whole-number stock value.')
      return
    }
    if (mode === 'edit' && !productId) {
      setError('The product could not be identified. Return to the Products list and try again.')
      return
    }

    // Validate rows before making any database change so incomplete entries do
    // not create a misleading partial product save.
    try {
      specificationPayload(productId ?? 'pending-product-id', specificationRows)
    } catch (specificationError) {
      setError(specificationError instanceof Error ? specificationError.message : 'Check the specification rows and try again.')
      return
    }

    setIsSaving(true)
    setUploadProgress(imageFiles.length ? { completed: 0, total: imageFiles.length } : null)

    try {
      const isExistingProduct = Boolean(productId)
      const productPayload = {
        name: values.name.trim(),
        brand: values.brand.trim() || null,
        category: values.category,
        price,
        stock,
        status: values.status,
        short_description: values.shortDescription.trim() || null,
        description: values.description.trim() || null,
        specifications: {},
        image_urls: [],
        featured: values.featured,
        is_active: values.isActive,
      }

      if (!isExistingProduct) {
        const createdSlug = await uniqueSlugForCreate(normalizedSlug)
        const { data, error: insertError } = await supabase
          .from('products')
          .insert({ ...productPayload, slug: createdSlug })
          .select('id,name,slug,brand,category,price,stock,status,featured,is_active,image_urls')
          .single()
        if (insertError || !data) {
          console.error('[Hydro Blasters MNL] products insert failed:', insertError)
          throw insertError ?? new Error('The product could not be created.')
        }
        setProductId(data.id)

        let savedProduct = data
        let uploadedImageUrls: string[] = []
        if (imageFiles.length > 0) {
          uploadedImageUrls = await uploadProductImages({
            files: imageFiles,
            productId: data.id,
            onProgress: (completed, total) => setUploadProgress({ completed, total }),
          })
          if (uploadedImageUrls.length !== imageFiles.length) throw new Error('Product saved, but not every selected image returned a public URL. Please retry the image upload.')
          console.log('[Hydro Blasters MNL] Final image_urls payload sent to Supabase:', uploadedImageUrls)
          const { data: imageUpdatedProduct, error: imageUpdateError } = await supabase
            .from('products')
            .update({ image_urls: uploadedImageUrls, updated_at: new Date().toISOString() })
            .eq('id', data.id)
            .select('id,name,slug,brand,category,price,stock,status,featured,is_active,image_urls')
            .single()
          if (imageUpdateError || !imageUpdatedProduct) throw imageUpdateError ?? new Error('Product saved, but its image URLs could not be saved.')
          savedProduct = imageUpdatedProduct
        }
        setExistingImageUrls(uploadedImageUrls)
        setLoadedImageUrls(uploadedImageUrls)
        setImageFiles([])
        try {
          await saveSpecificationRows(data.id, specificationRows, false)
        } catch (specificationError) {
          setError(describeSpecificationError(specificationError, true))
          return
        }
        markWebsiteChangesUnpublished()
        window.localStorage.setItem('hydro-products-updated', JSON.stringify({ product: savedProduct, updatedAt: Date.now() }))
        window.dispatchEvent(new Event('hydro-products-updated'))
        router.push('/admin/products?created=1')
        router.refresh()
        return
      }

      const uploadProductId = productId as string
      const uploadedImageUrls = imageFiles.length
        ? await uploadProductImages({ files: imageFiles, productId: uploadProductId, onProgress: (completed, total) => setUploadProgress({ completed, total }) })
        : []
      if (imageFiles.length > 0 && uploadedImageUrls.length !== imageFiles.length) throw new Error('Not every selected image returned a public URL. The product was not saved.')
      const remainingExistingImageUrls = [...existingImageUrls]
      const finalImageUrls = [
        ...remainingExistingImageUrls,
        ...uploadedImageUrls,
      ]
      const removedImageUrls = loadedImageUrls.filter((url) => !remainingExistingImageUrls.includes(url))
      const updatePayload = {
        name: values.name.trim(),
        brand: values.brand.trim() || null,
        category: values.category,
        price,
        stock,
        status: values.status,
        short_description: values.shortDescription.trim() || null,
        description: values.description.trim() || null,
        specifications: {},
        image_urls: finalImageUrls,
        featured: values.featured,
        is_active: values.isActive,
        updated_at: new Date().toISOString(),
      }
      console.log('Update payload:', updatePayload)
      console.log('[Hydro Blasters MNL] Final image_urls payload sent to Supabase:', finalImageUrls)
      const { data, error: updateError } = await supabase
        .from('products')
        .update(updatePayload)
        .eq('id', productId as string)
        .select('id,name,slug,brand,category,price,stock,status,featured,is_active,image_urls')
        .single()
      if (updateError) throw updateError
      console.log('Returned Supabase row:', data)
      const savedUrls: string[] = Array.isArray(data?.image_urls) ? data.image_urls : []
      if (savedUrls.length !== finalImageUrls.length || savedUrls.some((url, index) => url !== finalImageUrls[index])) {
        throw new Error('The product was saved, but its uploaded image URLs were not returned by Supabase. The form has not been marked as successful.')
      }
      try {
        await saveSpecificationRows(productId as string, specificationRows, true)
      } catch (specificationError) {
        setExistingImageUrls(finalImageUrls)
        setLoadedImageUrls(finalImageUrls)
        setImageFiles([])
        setError(describeSpecificationError(specificationError, true))
        return
      }
      await deleteProductImages(removedImageUrls)
      setSlug(data.slug)
      markWebsiteChangesUnpublished()
      window.localStorage.setItem('hydro-products-updated', JSON.stringify({ product: data, updatedAt: Date.now() }))
      window.dispatchEvent(new Event('hydro-products-updated'))
      router.push('/admin/products?updated=1')
      router.refresh()
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
          {mode === 'add' && <div className={styles.field}><label htmlFor="product-slug">Slug</label><input id="product-slug" required value={slug} onChange={(event) => { setSlugEdited(true); setSlug(event.target.value) }} placeholder="product-slug" /><span className={styles.slugHint}>Generated from the product name. You can edit it before saving.</span></div>}
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
        </div>
      </section>
      <section className={styles.formSection}>
        <div className={styles.specificationHeader}><div><h2>Specifications</h2><p>Add structured product details. Their displayed order is saved.</p></div><button className={styles.secondaryButton} type="button" onClick={() => setSpecificationRows((current) => [...current, newSpecificationRow()])} disabled={isSaving}>Add specification</button></div>
        {specificationRows.length === 0 ? <p className={styles.specificationEmpty}>No specifications added yet.</p> : <div className={styles.specificationList}>{specificationRows.map((row, index) => <div className={styles.specificationRow} key={row.id}>
          <div className={styles.field}><label htmlFor={`specification-label-${row.id}`}>Specification label</label><input id={`specification-label-${row.id}`} value={row.label} onChange={(event) => updateSpecificationRow(row.id, 'label', event.target.value)} placeholder="Body" disabled={isSaving} /></div>
          <div className={styles.field}><label htmlFor={`specification-value-${row.id}`}>Specification value</label><input id={`specification-value-${row.id}`} value={row.value} onChange={(event) => updateSpecificationRow(row.id, 'value', event.target.value)} placeholder="Nylon material" disabled={isSaving} /></div>
          <div className={styles.specificationActions}><button type="button" className={styles.rowAction} onClick={() => moveSpecificationRow(index, -1)} disabled={isSaving || index === 0} aria-label={`Move ${row.label || 'specification'} up`}>↑</button><button type="button" className={styles.rowAction} onClick={() => moveSpecificationRow(index, 1)} disabled={isSaving || index === specificationRows.length - 1} aria-label={`Move ${row.label || 'specification'} down`}>↓</button><button type="button" className={`${styles.rowAction} ${styles.rowDelete}`} onClick={() => setSpecificationRows((current) => current.filter((currentRow) => currentRow.id !== row.id))} disabled={isSaving}>Remove</button></div>
        </div>)}</div>}
      </section>
      <section className={styles.formSection}><h2>Product images</h2><ProductImageUploader files={imageFiles} onFilesChange={setImageFiles} existingImageUrls={existingImageUrls} onExistingImageUrlsChange={setExistingImageUrls} disabled={isSaving} progress={uploadProgress} /></section>
      <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={() => router.push('/admin/products')}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={isSaving}>{isSaving ? 'Saving…' : mode === 'add' ? 'Save product' : 'Save changes'}</button></div>
    </form>
  )
}
