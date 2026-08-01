'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase/client'
import { deleteProductImages, uploadProductImages } from '../../lib/supabase/product-images'
import { fetchAdminProduct, findAvailableProductSlug } from '../../lib/supabase/products'
import { fetchProductSpecifications, normalizeSpecificationRows, replaceProductSpecifications } from '../../lib/supabase/product-specifications'
import { markCatalogueWriteComplete, markCatalogueWritePending, markWebsiteChangesUnpublished } from '../../lib/admin/publishing'
import { requireAdminSession } from '../../lib/admin/auth'
import { ProductImageUploader } from './ProductImageUploader'
import styles from './admin.module.css'

type ProductFormProps = { mode: 'add' | 'edit' }
type SpecificationRow = { id: string; label: string; value: string }
type SupabaseError = { message?: string; code?: string; details?: string | null; hint?: string | null }
type ProductDraft = ReturnType<typeof initialValues>

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
  // Draft state belongs only to this form. It is never shared with the public
  // catalogue or written to localStorage until a successful Supabase save.
  const [draft, setDraft] = useState<ProductDraft>(initialValues)
  const savedDraftRef = useRef<ProductDraft | null>(null)
  const [newProductSlug, setNewProductSlug] = useState('')
  const [newProductSlugEdited, setNewProductSlugEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([])
  const [loadedImageUrls, setLoadedImageUrls] = useState<string[]>([])
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [isLoadingProduct, setIsLoadingProduct] = useState(mode === 'edit')
  const [specificationRows, setSpecificationRows] = useState<SpecificationRow[]>([])
  const specificationRowsRef = useRef<SpecificationRow[]>([])

  useEffect(() => {
    if (mode !== 'edit') return
    const id = new URLSearchParams(window.location.search).get('id')
    if (!id) {
      setError('Choose a product from the Products list to edit it.')
      setIsLoadingProduct(false)
      return
    }

    async function loadProduct() {
      const { data, error: loadError } = await fetchAdminProduct(id as string)
      if (loadError || !data) {
        setError(loadError?.message ?? 'The product could not be found.')
        setIsLoadingProduct(false)
        return
      }
      setProductId(data.id)
      const savedDraft = {
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
      }
      savedDraftRef.current = { ...savedDraft }
      setDraft({ ...savedDraft })
      const { data: specificationData, error: specificationError } = await fetchProductSpecifications(data.id)
      if (specificationError) {
        setError(`The product loaded, but its specifications could not be loaded. ${specificationError.message}`)
      } else {
        const rows = (specificationData ?? []).map((row) => ({ id: row.id, label: row.label, value: row.value }))
        specificationRowsRef.current = rows
        setSpecificationRows(rows)
      }
      const existingUrls = Array.isArray(data.image_urls) ? data.image_urls : []
      setExistingImageUrls(existingUrls)
      setLoadedImageUrls(existingUrls)
      setIsLoadingProduct(false)
    }
    loadProduct()
  }, [mode])

  function update<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function handleNameChange(name: string) {
    update('name', name)
    // A slug is generated only for a new, unsaved product. Existing product
    // URLs are permanent and an edit draft can never recalculate them.
    if (mode === 'add' && !newProductSlugEdited) setNewProductSlug(slugify(name))
  }

  function discardDraft() {
    if (mode === 'edit' && savedDraftRef.current) setDraft({ ...savedDraftRef.current })
    if (mode === 'add') {
      setDraft(initialValues())
      setNewProductSlug('')
      setNewProductSlugEdited(false)
    }
    router.push('/admin/products')
  }

  function updateSpecificationRow(id: string, field: 'label' | 'value', value: string) {
    const next = specificationRowsRef.current.map((row) => row.id === id ? { ...row, [field]: value } : row)
    specificationRowsRef.current = next
    setSpecificationRows(next)
  }

  function moveSpecificationRow(index: number, direction: -1 | 1) {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= specificationRowsRef.current.length) return
    const next = [...specificationRowsRef.current]
    const [row] = next.splice(index, 1)
    next.splice(nextIndex, 0, row)
    specificationRowsRef.current = next
    setSpecificationRows(next)
  }

  function specificationRowsFromSubmittedForm(form: HTMLFormElement) {
    // This deliberately reads the rendered inputs—not React state or a ref.
    // It is the exact form snapshot visible to the administrator at submit.
    const rows = Array.from(form.querySelectorAll<HTMLElement>('[data-specification-row]')).map((element, index) => {
      const labelInput = element.querySelector<HTMLInputElement>('[data-specification-label]')
      const valueInput = element.querySelector<HTMLInputElement>('[data-specification-value]')
      return {
        id: element.dataset.specificationId ?? `submitted-row-${index}`,
        label: labelInput?.value ?? '',
        value: valueInput?.value ?? '',
      }
    })
    specificationRowsRef.current = rows
    setSpecificationRows(rows)
    return rows
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

  function describeProductSaveError(error: unknown) {
    const supabaseError = error as SupabaseError
    console.error('[Hydro Blasters MNL] product save failed:', {
      message: supabaseError?.message,
      code: supabaseError?.code,
      details: supabaseError?.details,
      hint: supabaseError?.hint,
    })
    if (supabaseError?.code === '42501') return 'Database permission denied (42501). Your signed-in session did not satisfy the administrator RLS policy.'
    return supabaseError?.message || 'The product could not be saved. Please try again.'
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const visibleSpecificationRows = specificationRowsFromSubmittedForm(event.currentTarget)
    const submittedSpecificationRows = visibleSpecificationRows.map((row) => ({ ...row }))
    const normalizedSlug = newProductSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const price = Number(draft.price)
    const stock = Number(draft.stock)
    if (!draft.name.trim() || (mode === 'add' && !normalizedSlug) || !draft.category || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
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
      normalizeSpecificationRows(submittedSpecificationRows)
    } catch (specificationError) {
      setError(specificationError instanceof Error ? specificationError.message : 'Check the specification rows and try again.')
      return
    }

    setIsSaving(true)
    markCatalogueWritePending()
    setUploadProgress(imageFiles.length ? { completed: 0, total: imageFiles.length } : null)

    try {
      await requireAdminSession()
      const isExistingProduct = Boolean(productId)
      const productPayload = {
        name: draft.name.trim(),
        brand: draft.brand.trim() || null,
        category: draft.category,
        price,
        stock,
        status: draft.status,
        short_description: draft.shortDescription.trim() || null,
        description: draft.description.trim() || null,
        specifications: {},
        image_urls: [],
        featured: draft.featured,
        is_active: draft.isActive,
      }

      if (!isExistingProduct) {
        const createdSlug = await findAvailableProductSlug(normalizedSlug)
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
          await replaceProductSpecifications(data.id, submittedSpecificationRows)
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
        name: draft.name.trim(),
        brand: draft.brand.trim() || null,
        category: draft.category,
        price,
        stock,
        status: draft.status,
        short_description: draft.shortDescription.trim() || null,
        description: draft.description.trim() || null,
        specifications: {},
        image_urls: finalImageUrls,
        featured: draft.featured,
        is_active: draft.isActive,
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
        await replaceProductSpecifications(productId as string, submittedSpecificationRows)
      } catch (specificationError) {
        setExistingImageUrls(finalImageUrls)
        setLoadedImageUrls(finalImageUrls)
        setImageFiles([])
        setError(describeSpecificationError(specificationError, true))
        return
      }
      await deleteProductImages(removedImageUrls)
      markWebsiteChangesUnpublished()
      window.localStorage.setItem('hydro-products-updated', JSON.stringify({ product: data, updatedAt: Date.now() }))
      window.dispatchEvent(new Event('hydro-products-updated'))
      router.push('/admin/products?updated=1')
      router.refresh()
    } catch (saveError) {
      setError(describeProductSaveError(saveError))
    } finally {
      markCatalogueWriteComplete()
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
          <div className={styles.field}><label htmlFor="product-name">Product Name</label><input id="product-name" required value={draft.name} onChange={(event) => handleNameChange(event.target.value)} placeholder="Enter product name" /></div>
          {mode === 'add' && <div className={styles.field}><label htmlFor="product-slug">Slug</label><input id="product-slug" required value={newProductSlug} onChange={(event) => { setNewProductSlugEdited(true); setNewProductSlug(event.target.value) }} placeholder="product-slug" /><span className={styles.slugHint}>Generated from the product name. You can edit it before saving.</span></div>}
          <div className={styles.field}><label htmlFor="brand">Brand</label><input id="brand" value={draft.brand} onChange={(event) => update('brand', event.target.value)} placeholder="Brand name" /></div>
          <div className={styles.field}><label htmlFor="category">Category</label><select id="category" required value={draft.category} onChange={(event) => update('category', event.target.value)}><option value="" disabled>Select a category</option>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>
          <div className={styles.field}><label htmlFor="price">Price</label><input id="price" required min="0" step="0.01" type="number" value={draft.price} onChange={(event) => update('price', event.target.value)} /></div>
          <div className={styles.field}><label htmlFor="stock">Stock</label><input id="stock" required min="0" step="1" type="number" value={draft.stock} onChange={(event) => update('stock', event.target.value)} /></div>
          <div className={styles.field}><label htmlFor="status">Status</label><select id="status" value={draft.status} onChange={(event) => update('status', event.target.value)}>{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></div>
          <div className={styles.toggleRow}>
            <label className={styles.toggle}><span><strong>Featured</strong><span>Set featured status</span></span><input className={styles.switch} type="checkbox" checked={draft.featured} onChange={(event) => update('featured', event.target.checked)} /></label>
            <label className={styles.toggle}><span><strong>Active</strong><span>Set active status</span></span><input className={styles.switch} type="checkbox" checked={draft.isActive} onChange={(event) => update('isActive', event.target.checked)} /></label>
          </div>
          <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="short-description">Short Description</label><textarea id="short-description" value={draft.shortDescription} onChange={(event) => update('shortDescription', event.target.value)} placeholder="Short product description" /></div>
          <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="description">Full Description</label><textarea id="description" value={draft.description} onChange={(event) => update('description', event.target.value)} placeholder="Full product description" /></div>
        </div>
      </section>
      <section className={styles.formSection}>
        <div className={styles.specificationHeader}><div><h2>Specifications</h2><p>Add structured product details. Their displayed order is saved.</p></div><button className={styles.secondaryButton} type="button" onClick={() => { const next = [...specificationRowsRef.current, newSpecificationRow()]; specificationRowsRef.current = next; setSpecificationRows(next) }} disabled={isSaving}>Add specification</button></div>
        {specificationRows.length === 0 ? <p className={styles.specificationEmpty}>No specifications added yet.</p> : <div className={styles.specificationList}>{specificationRows.map((row, index) => <div className={styles.specificationRow} data-specification-row data-specification-id={row.id} key={row.id}>
          <div className={styles.field}><label htmlFor={`specification-label-${row.id}`}>Specification label</label><input id={`specification-label-${row.id}`} data-specification-label value={row.label} onChange={(event) => updateSpecificationRow(row.id, 'label', event.target.value)} placeholder="Body" disabled={isSaving} /></div>
          <div className={styles.field}><label htmlFor={`specification-value-${row.id}`}>Specification value</label><input id={`specification-value-${row.id}`} data-specification-value value={row.value} onChange={(event) => updateSpecificationRow(row.id, 'value', event.target.value)} placeholder="Nylon material" disabled={isSaving} /></div>
          <div className={styles.specificationActions}><button type="button" className={styles.rowAction} onClick={() => moveSpecificationRow(index, -1)} disabled={isSaving || index === 0} aria-label={`Move ${row.label || 'specification'} up`}>↑</button><button type="button" className={styles.rowAction} onClick={() => moveSpecificationRow(index, 1)} disabled={isSaving || index === specificationRows.length - 1} aria-label={`Move ${row.label || 'specification'} down`}>↓</button><button type="button" className={`${styles.rowAction} ${styles.rowDelete}`} onClick={() => { const next = specificationRowsRef.current.filter((currentRow) => currentRow.id !== row.id); specificationRowsRef.current = next; setSpecificationRows(next) }} disabled={isSaving}>Remove</button></div>
        </div>)}</div>}
      </section>
      <section className={styles.formSection}><h2>Product images</h2><ProductImageUploader files={imageFiles} onFilesChange={setImageFiles} existingImageUrls={existingImageUrls} onExistingImageUrlsChange={setExistingImageUrls} disabled={isSaving} progress={uploadProgress} /></section>
      <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={discardDraft}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={isSaving}>{isSaving ? 'Saving…' : mode === 'add' ? 'Save product' : 'Save changes'}</button></div>
    </form>
  )
}
