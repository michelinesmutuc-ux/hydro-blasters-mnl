'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase/client'
import { deleteProductImages, uploadProductImages } from '../../lib/supabase/product-images'
import { fetchAdminProduct, findAvailableProductSlug } from '../../lib/supabase/products'
import { fetchProductSpecifications, normalizeSpecificationRows, replaceProductSpecifications } from '../../lib/supabase/product-specifications'
import { fetchProductVariants, replaceProductVariants, validateVariants, type VariantDraft } from '../../lib/supabase/product-variants'
import { markCatalogueWriteComplete, markCatalogueWritePending, markWebsiteChangesUnpublished } from '../../lib/admin/publishing'
import { requireAdminSession } from '../../lib/admin/auth'
import { GEL_BLASTER_TYPES, isGelBlasterCategory, isGelBlasterType, parseGelBlasterType, type GelBlasterType } from '../../lib/products/product-types'
import { productCategoryOptions } from '../../lib/products/category-order'
import { shippingClassOptions, normalizeShippingClass, type ShippingClass } from '../../lib/shipping/classes'
import { ProductImageUploader } from './ProductImageUploader'
import styles from './admin.module.css'

type ProductFormProps = { mode: 'add' | 'edit' }
type SpecificationRow = { id: string; label: string; value: string }
type SupabaseError = { message?: string; code?: string; details?: string | null; hint?: string | null }
type ProductDraft = ReturnType<typeof initialValues>
type HighlightType = 'none' | 'new_arrival' | 'featured' | 'best_seller' | 'clearance_sale' | 'limited_stock'

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_stock', label: 'In Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'preorder', label: 'Pre-order' },
]

const highlightOptions: { value: HighlightType; label: string }[] = [
  { value: 'none', label: 'None — no badge' },
  { value: 'new_arrival', label: 'New Arrival' },
  { value: 'featured', label: 'Featured' },
  { value: 'best_seller', label: 'Best Seller' },
  { value: 'clearance_sale', label: 'Clearance Sale' },
  { value: 'limited_stock', label: 'Limited Stock' },
]

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function initialValues() {
  return { name: '', brand: '', category: '', productType: '' as GelBlasterType | '', price: '0', stock: '0', status: 'draft', shippingClass: 'Bulky' as ShippingClass, shortDescription: '', description: '', featured: false, isActive: false, isClearance: false, isBestSeller: false, hasVariants: false, variantGroupName: '', showOnHomepage: false, highlightType: 'none' as HighlightType, homepageSortOrder: '' }
}

function newSpecificationRow(): SpecificationRow {
  return { id: crypto.randomUUID(), label: '', value: '' }
}
function newVariantRow(): VariantDraft { return { id: crypto.randomUUID(), name: '', price: '0', stock: '0', sku: '', image_url: '' } }

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
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null)
  const [specificationRows, setSpecificationRows] = useState<SpecificationRow[]>([])
  const [variantRows, setVariantRows] = useState<VariantDraft[]>([])
  const [loadedVariantImageUrls, setLoadedVariantImageUrls] = useState<string[]>([])
  const specificationRowsRef = useRef<SpecificationRow[]>([])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = mode === 'edit' ? params.get('id') : params.get('duplicateFrom')
    if (!id && mode === 'add') return
    if (!id) {
      setError('Choose a product from the Products list to edit it.')
      setIsLoadingProduct(false)
      return
    }

    async function loadProduct() {
      if (mode === 'add') setIsLoadingProduct(true)
      const { data, error: loadError } = await fetchAdminProduct(id as string)
      if (loadError || !data) {
        setError(loadError?.message ?? 'The product could not be found.')
        setIsLoadingProduct(false)
        return
      }
      const duplicateName = mode === 'add' ? `${data.name} (Copy)` : data.name
      const savedDraft = {
        name: duplicateName,
        brand: data.brand ?? '',
        category: data.category,
        productType: parseGelBlasterType(data.product_type),
        price: String(data.price),
        stock: mode === 'add' ? '0' : String(data.stock),
        status: data.status,
        shippingClass: normalizeShippingClass(data.shipping_class),
        shortDescription: data.short_description ?? '',
        description: data.description ?? '',
        featured: data.featured,
        isActive: mode === 'add' ? false : data.is_active,
        isClearance: mode === 'add' ? false : data.is_clearance ?? false,
        isBestSeller: mode === 'add' ? false : data.is_best_seller ?? false,
        hasVariants: data.has_variants ?? false,
        variantGroupName: data.variant_group_name ?? '',
        showOnHomepage: mode === 'add' ? false : data.show_on_homepage ?? false,
        highlightType: (data.highlight_type ?? 'none') as HighlightType,
        homepageSortOrder: data.homepage_sort_order === null || data.homepage_sort_order === undefined ? '' : String(data.homepage_sort_order),
      }
      if (mode === 'edit') {
        setProductId(data.id)
        savedDraftRef.current = { ...savedDraft }
      } else {
        setDuplicateSourceId(data.id)
        setNewProductSlug(slugify(duplicateName))
        setNewProductSlugEdited(false)
        setExistingImageUrls([])
        setLoadedImageUrls([])
        setImageFiles([])
      }
      setDraft({ ...savedDraft })
      const { data: specificationData, error: specificationError } = await fetchProductSpecifications(data.id)
      if (specificationError) {
        setError(mode === 'add'
          ? `The product could not be used as a template because its specifications could not be loaded. ${specificationError.message}`
          : `The product loaded, but its specifications could not be loaded. ${specificationError.message}`)
        setIsLoadingProduct(false)
        return
      } else {
        const rows = (specificationData ?? []).map((row) => ({ id: mode === 'add' ? crypto.randomUUID() : row.id, label: row.label, value: row.value }))
        specificationRowsRef.current = rows
        setSpecificationRows(rows)
      }
      const existingUrls = Array.isArray(data.image_urls) ? data.image_urls : []
      const { data: variantData, error: variantError } = await fetchProductVariants(data.id)
      if (variantError) {
        setError(`The product loaded, but its variants could not be loaded. ${variantError.message}`)
        setIsLoadingProduct(false)
        return
      }
      setVariantRows((variantData ?? []).map((variant) => ({ id: mode === 'add' ? crypto.randomUUID() : variant.id, name: variant.name, price: String(variant.price), stock: String(variant.stock), sku: variant.sku ?? '', image_url: mode === 'add' ? '' : variant.image_url ?? '' })))
      setLoadedVariantImageUrls(mode === 'add' ? [] : (variantData ?? []).map((variant) => variant.image_url).filter((url): url is string => Boolean(url)))
      setExistingImageUrls(existingUrls)
      setLoadedImageUrls(existingUrls)
      setIsLoadingProduct(false)
    }
    loadProduct()
  }, [mode])

  function update<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function updateCategory(category: string) {
    setDraft((current) => ({
      ...current,
      category,
      productType: isGelBlasterCategory(category) ? current.productType : '',
    }))
  }

  function handleNameChange(name: string) {
    update('name', name)
    // A slug is generated only for a new, unsaved product. Existing product
    // URLs are permanent and an edit draft can never recalculate them.
    if (mode === 'add' && (duplicateSourceId || !newProductSlugEdited)) setNewProductSlug(slugify(name))
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

  function moveVariantRow(index: number, direction: -1 | 1) {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= variantRows.length) return
    setVariantRows((current) => {
      const next = [...current]
      const [row] = next.splice(index, 1)
      next.splice(nextIndex, 0, row)
      return next
    })
  }

  function removeVariantRow(id: string) {
    // Variant rows are the source of truth for validation and the save payload.
    // Remove the object itself; never leave an empty placeholder behind.
    const nextRows = variantRows.filter((variant) => variant.id !== id)
    setVariantRows(nextRows)

    // An empty option list cannot be a variant product. Turning the feature off
    // makes a duplicate/new product immediately valid as a normal product and,
    // on save, causes existing saved variant rows to be removed as well.
    if (nextRows.length === 0) {
      setDraft((current) => ({ ...current, hasVariants: false, variantGroupName: '' }))
    }
  }

  async function prepareVariantImages(savedProductId: string, rows: VariantDraft[]) {
    const rowsWithNewImages = rows.filter((row) => row.image_file)
    if (rowsWithNewImages.length === 0) return rows
    let completed = 0
    const total = rowsWithNewImages.length
    const preparedRows: VariantDraft[] = []
    for (const row of rows) {
      if (!row.image_file) {
        preparedRows.push(row)
        continue
      }
      const [imageUrl] = await uploadProductImages({
        files: [row.image_file],
        productId: savedProductId,
        onProgress: () => {
          completed += 1
          setUploadProgress({ completed, total })
        },
      })
      if (!imageUrl) throw new Error(`Variant image for ${row.name || 'this option'} could not be uploaded.`)
      preparedRows.push({ ...row, image_url: imageUrl, image_file: null })
    }
    return preparedRows
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
    let validatedVariants: ReturnType<typeof validateVariants> = []
    try {
      validatedVariants = validateVariants(draft.hasVariants, variantRows)
    } catch (variantError) {
      setError(variantError instanceof Error ? variantError.message : 'Check the variant options and try again.')
      return
    }
    if (draft.hasVariants && !draft.variantGroupName.trim()) {
      setError('Enter a Variant Group Name, such as Color or Package.')
      return
    }
    if (mode === 'add' && isGelBlasterCategory(draft.category) && !isGelBlasterType(draft.productType)) {
      setError('Please select a Gel Blaster type.')
      return
    }
    const effectivePrice = draft.hasVariants ? Math.min(...validatedVariants.map((variant) => Number(variant.price))) : price
    const effectiveStock = draft.hasVariants ? validatedVariants.reduce((total, variant) => total + Number(variant.stock), 0) : stock
    const homepageSortOrder = draft.homepageSortOrder.trim() === '' ? null : Number(draft.homepageSortOrder)
    if (!draft.name.trim() || (mode === 'add' && !normalizedSlug) || !draft.category || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0 || (homepageSortOrder !== null && !Number.isInteger(homepageSortOrder))) {
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
        product_type: isGelBlasterCategory(draft.category) && isGelBlasterType(draft.productType) ? draft.productType : null,
        price: effectivePrice,
        stock: effectiveStock,
        status: draft.status,
        shipping_class: draft.shippingClass,
        short_description: draft.shortDescription.trim() || null,
        description: draft.description.trim() || null,
        specifications: {},
        image_urls: [],
        featured: draft.featured,
        is_clearance: draft.isClearance,
        is_best_seller: draft.isBestSeller,
        is_active: draft.isActive,
        has_variants: draft.hasVariants,
        variant_group_name: draft.hasVariants ? draft.variantGroupName.trim() : null,
        show_on_homepage: draft.showOnHomepage,
        highlight_type: draft.showOnHomepage && draft.highlightType !== 'none' ? draft.highlightType : null,
        homepage_sort_order: draft.showOnHomepage ? homepageSortOrder : null,
      }

      if (!isExistingProduct) {
        const createdSlug = await findAvailableProductSlug(normalizedSlug)
        const { data, error: insertError } = await supabase
          .from('products')
          .insert({ ...productPayload, slug: createdSlug })
          .select('id,name,slug,brand,category,product_type,price,stock,status,featured,is_active,is_clearance,is_best_seller,has_variants,variant_group_name,show_on_homepage,highlight_type,homepage_sort_order,image_urls')
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
            .select('id,name,slug,brand,category,product_type,price,stock,status,featured,is_active,is_clearance,is_best_seller,has_variants,variant_group_name,show_on_homepage,highlight_type,homepage_sort_order,image_urls')
            .single()
          if (imageUpdateError || !imageUpdatedProduct) throw imageUpdateError ?? new Error('Product saved, but its image URLs could not be saved.')
          savedProduct = imageUpdatedProduct
        }
        setExistingImageUrls(uploadedImageUrls)
        setLoadedImageUrls(uploadedImageUrls)
        setImageFiles([])
        try {
          const savedVariantRows = draft.hasVariants ? await prepareVariantImages(data.id, variantRows) : []
          await replaceProductSpecifications(data.id, submittedSpecificationRows)
          await replaceProductVariants(data.id, savedVariantRows)
        } catch (specificationError) {
          setError(`Product saved, but product details could not be saved. ${(specificationError as SupabaseError)?.message ?? 'Please retry.'}`)
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
        product_type: isGelBlasterCategory(draft.category) && isGelBlasterType(draft.productType) ? draft.productType : null,
        price: effectivePrice,
        stock: effectiveStock,
        status: draft.status,
        shipping_class: draft.shippingClass,
        short_description: draft.shortDescription.trim() || null,
        description: draft.description.trim() || null,
        specifications: {},
        image_urls: finalImageUrls,
        featured: draft.featured,
        is_clearance: draft.isClearance,
        is_best_seller: draft.isBestSeller,
        is_active: draft.isActive,
        has_variants: draft.hasVariants,
        variant_group_name: draft.hasVariants ? draft.variantGroupName.trim() : null,
        show_on_homepage: draft.showOnHomepage,
        highlight_type: draft.showOnHomepage && draft.highlightType !== 'none' ? draft.highlightType : null,
        homepage_sort_order: draft.showOnHomepage ? homepageSortOrder : null,
        updated_at: new Date().toISOString(),
      }
      console.log('Update payload:', updatePayload)
      console.log('[Hydro Blasters MNL] Final image_urls payload sent to Supabase:', finalImageUrls)
      const { data, error: updateError } = await supabase
        .from('products')
        .update(updatePayload)
        .eq('id', productId as string)
        .select('id,name,slug,brand,category,product_type,price,stock,status,featured,is_active,is_clearance,is_best_seller,has_variants,variant_group_name,show_on_homepage,highlight_type,homepage_sort_order,image_urls')
        .single()
      if (updateError) throw updateError
      console.log('Returned Supabase row:', data)
      const savedUrls: string[] = Array.isArray(data?.image_urls) ? data.image_urls : []
      if (savedUrls.length !== finalImageUrls.length || savedUrls.some((url, index) => url !== finalImageUrls[index])) {
        throw new Error('The product was saved, but its uploaded image URLs were not returned by Supabase. The form has not been marked as successful.')
      }
      try {
        const savedVariantRows = draft.hasVariants ? await prepareVariantImages(productId as string, variantRows) : []
        await replaceProductSpecifications(productId as string, submittedSpecificationRows)
        await replaceProductVariants(productId as string, savedVariantRows)
        const currentVariantImageUrls = savedVariantRows.map((row) => row.image_url).filter((url): url is string => Boolean(url))
        const removedVariantImageUrls = loadedVariantImageUrls.filter((url) => !currentVariantImageUrls.includes(url) && !finalImageUrls.includes(url))
        if (removedVariantImageUrls.length > 0) {
          try {
            await deleteProductImages(removedVariantImageUrls)
          } catch {
            // The saved variant row is already correct. A later product-image cleanup can remove an unused object safely.
          }
        }
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
          {mode === 'add' && <div className={styles.field}><label htmlFor="product-slug">Slug</label><input id="product-slug" required value={newProductSlug} onChange={(event) => { setNewProductSlugEdited(true); setNewProductSlug(event.target.value) }} placeholder="product-slug" /><span className={styles.slugHint}>{duplicateSourceId ? 'Temporary slug generated from the duplicate name. It becomes permanent after the first save.' : 'Generated from the product name. You can edit it before saving.'}</span></div>}
          <div className={styles.field}><label htmlFor="brand">Brand</label><input id="brand" value={draft.brand} onChange={(event) => update('brand', event.target.value)} placeholder="Brand name" /></div>
          <div className={styles.field}><label htmlFor="category">Category</label><select id="category" required value={draft.category} onChange={(event) => updateCategory(event.target.value)}><option value="" disabled>Select a category</option>{productCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>
          {isGelBlasterCategory(draft.category) && <div className={styles.field}><label htmlFor="product-type">Type</label><select id="product-type" value={draft.productType} onChange={(event) => update('productType', event.target.value as GelBlasterType | '')}><option value="">Select Type</option>{GEL_BLASTER_TYPES.map((productType) => <option key={productType} value={productType}>{productType}</option>)}</select><span className={styles.slugHint}>{mode === 'add' ? 'Required for new Gel Blaster products.' : 'Optional for existing products until you classify them.'}</span></div>}
          <div className={styles.field}><label htmlFor="price">Price</label><input id="price" required min="0" step="0.01" type="number" value={draft.price} disabled={draft.hasVariants} onChange={(event) => update('price', event.target.value)} />{draft.hasVariants && <span className={styles.slugHint}>Calculated from the lowest variant price.</span>}</div>
          <div className={styles.field}><label htmlFor="stock">Stock</label><input id="stock" required min="0" step="1" type="number" value={draft.stock} disabled={draft.hasVariants} onChange={(event) => update('stock', event.target.value)} />{draft.hasVariants && <span className={styles.slugHint}>Calculated from total variant stock.</span>}</div>
          <div className={styles.field}><label htmlFor="status">Status</label><select id="status" value={draft.status} onChange={(event) => update('status', event.target.value)}>{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></div>
          <div className={styles.field}><label htmlFor="shipping-class">Shipping Class</label><select id="shipping-class" value={draft.shippingClass} onChange={(event) => update('shippingClass', event.target.value as ShippingClass)}>{shippingClassOptions.map((shippingClass) => <option key={shippingClass.value} value={shippingClass.value}>{shippingClass.label}</option>)}</select><span className={styles.slugHint}>Calculated from the full cart at checkout.</span></div>
          <div className={`${styles.toggleRow} ${styles.fieldFull}`}>
            <label className={styles.toggle}><span><strong>Active</strong><span>Show this product on the public website.</span></span><input className={styles.switch} type="checkbox" checked={draft.isActive} onChange={(event) => update('isActive', event.target.checked)} /></label>
          </div>
          <div className={`${styles.highlightToggleSection} ${styles.fieldFull}`}>
            <span className={styles.fieldLegend}>Product Highlights</span>
            <div className={styles.toggleRow}>
              <label className={styles.toggle}><span><strong>Featured</strong><span>Include in the Featured highlight filter.</span></span><input className={styles.switch} type="checkbox" checked={draft.featured} onChange={(event) => update('featured', event.target.checked)} /></label>
              <label className={styles.toggle}><span><strong>Clearance Sale</strong><span>Automatically excludes this product from Launch Promo.</span></span><input className={styles.switch} type="checkbox" checked={draft.isClearance} onChange={(event) => update('isClearance', event.target.checked)} /></label>
              <label className={styles.toggle}><span><strong>Best Seller</strong><span>Include in the Best Seller highlight filter.</span></span><input className={styles.switch} type="checkbox" checked={draft.isBestSeller} onChange={(event) => update('isBestSeller', event.target.checked)} /></label>
            </div>
          </div>
          <div className={`${styles.toggleRow} ${styles.fieldFull}`}>
            <label className={styles.toggle}><span><strong>This product has variants</strong><span>Use one option group, such as Color or Package.</span></span><input className={styles.switch} type="checkbox" checked={draft.hasVariants} onChange={(event) => update('hasVariants', event.target.checked)} /></label>
          </div>
          <div className={`${styles.toggleRow} ${styles.fieldFull}`}>
            <label className={styles.toggle}><span><strong>Show in Homepage Highlights</strong><span>Manually place this product in the homepage Featured Products section</span></span><input className={styles.switch} type="checkbox" checked={draft.showOnHomepage} onChange={(event) => update('showOnHomepage', event.target.checked)} /></label>
          </div>
          {draft.showOnHomepage && <div className={`${styles.highlightControls} ${styles.fieldFull}`}>
            <div className={styles.field}><label htmlFor="highlight-type">Highlight Type</label><select id="highlight-type" required value={draft.highlightType} onChange={(event) => update('highlightType', event.target.value as HighlightType)}>{highlightOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><span className={styles.slugHint}>Choose None to include the product without a homepage badge.</span></div>
            <div className={styles.field}><label htmlFor="homepage-sort-order">Homepage Display Order</label><input id="homepage-sort-order" type="number" step="1" value={draft.homepageSortOrder} onChange={(event) => update('homepageSortOrder', event.target.value)} placeholder="Optional — lower numbers appear first" /><span className={styles.slugHint}>If left blank, products are ordered by name.</span></div>
          </div>}
          <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="short-description">Short Description</label><textarea id="short-description" value={draft.shortDescription} onChange={(event) => update('shortDescription', event.target.value)} placeholder="Short product description" /></div>
          <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="description">Package Inclusions</label><textarea id="description" value={draft.description} onChange={(event) => update('description', event.target.value)} placeholder="List everything included with this product/package." /><span className={styles.slugHint}>List everything included with this product/package.</span></div>
        </div>
      </section>
      {draft.hasVariants && <section className={styles.formSection}>
        <div className={styles.specificationHeader}><div><h2>Variants</h2><p>Use one option group only. Variant price and stock are used at checkout.</p></div><button className={styles.secondaryButton} type="button" onClick={() => setVariantRows((current) => [...current, newVariantRow()])} disabled={isSaving}>Add Variant</button></div>
        <div className={styles.field}><label htmlFor="variant-group-name">Variant Group Name</label><input id="variant-group-name" required value={draft.variantGroupName} onChange={(event) => update('variantGroupName', event.target.value)} placeholder="Color" disabled={isSaving} /></div>
        {variantRows.length === 0 ? <p className={styles.specificationEmpty}>Add at least one variant option before saving.</p> : <div className={styles.specificationList}>{variantRows.map((row, index) => <div className={styles.variantRow} key={row.id}>
          <div className={styles.field}><label htmlFor={`variant-name-${row.id}`}>Variant Name</label><input id={`variant-name-${row.id}`} value={row.name} onChange={(event) => setVariantRows((current) => current.map((variant) => variant.id === row.id ? { ...variant, name: event.target.value } : variant))} placeholder="Black" disabled={isSaving} /></div>
          <div className={styles.field}><label htmlFor={`variant-price-${row.id}`}>Price</label><input id={`variant-price-${row.id}`} type="number" min="0" step="0.01" value={row.price} onChange={(event) => setVariantRows((current) => current.map((variant) => variant.id === row.id ? { ...variant, price: event.target.value } : variant))} disabled={isSaving} /></div>
          <div className={styles.field}><label htmlFor={`variant-stock-${row.id}`}>Stock</label><input id={`variant-stock-${row.id}`} type="number" min="0" step="1" value={row.stock} onChange={(event) => setVariantRows((current) => current.map((variant) => variant.id === row.id ? { ...variant, stock: event.target.value } : variant))} disabled={isSaving} /></div>
          <div className={styles.field}><label htmlFor={`variant-sku-${row.id}`}>SKU (optional)</label><input id={`variant-sku-${row.id}`} value={row.sku ?? ''} onChange={(event) => setVariantRows((current) => current.map((variant) => variant.id === row.id ? { ...variant, sku: event.target.value } : variant))} disabled={isSaving} /></div>
          <div className={`${styles.field} ${styles.variantImageField}`}><span className={styles.fieldLegend}>Variant Image (optional)</span><ProductImageUploader files={row.image_file ? [row.image_file] : []} onFilesChange={(files) => setVariantRows((current) => current.map((variant) => variant.id === row.id ? { ...variant, image_file: files[0] ?? null, image_url: files[0] ? null : variant.image_url } : variant))} existingImageUrls={row.image_url ? [row.image_url] : []} onExistingImageUrlsChange={() => setVariantRows((current) => current.map((variant) => variant.id === row.id ? { ...variant, image_url: null, image_file: null } : variant))} disabled={isSaving} progress={null} maxFiles={1} uploadTitle="Drop a variant image here or choose a file" uploadHint="Optional JPG, PNG, or WebP. This replaces only the main product image when selected." previewLabel={`variant ${row.name || index + 1}`} /></div>
          <div className={styles.specificationActions}><button type="button" className={styles.rowAction} onClick={() => moveVariantRow(index, -1)} disabled={isSaving || index === 0}>Move up</button><button type="button" className={styles.rowAction} onClick={() => moveVariantRow(index, 1)} disabled={isSaving || index === variantRows.length - 1}>Move down</button><button type="button" className={`${styles.rowAction} ${styles.rowDelete}`} onClick={() => removeVariantRow(row.id)} disabled={isSaving}>Remove</button></div>
        </div>)}</div>}
      </section>}
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
