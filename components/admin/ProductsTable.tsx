'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase/client'
import { deleteProductImages } from '../../lib/supabase/product-images'
import { fetchAdminProducts } from '../../lib/supabase/products'
import { markWebsiteChangesUnpublished } from '../../lib/admin/publishing'
import { requireAdminSession } from '../../lib/admin/auth'
import { GEL_BLASTER_TYPES, gelBlasterTypeFilterLabels, isGelBlasterCategory, isGelBlasterType, type GelBlasterType } from '../../lib/products/product-types'
import { normalizeProductCategory, productCategoryOptions } from '../../lib/products/category-order'
import { normalizeShippingClass, shippingClassOptions, type ShippingClass } from '../../lib/shipping/classes'
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
  is_clearance: boolean
  is_best_seller: boolean
  is_active: boolean
  image_urls: string[]
  has_variants: boolean
  created_at: string
  updated_at: string | null
  shipping_class: ShippingClass | null
}

type ProductFilters = {
  search: string
  category: string
  productType: GelBlasterType | ''
  publication: 'all' | 'published' | 'inactive'
  highlight: 'all' | 'clearance_sale' | 'best_seller' | 'featured'
  stock: 'all' | 'in-stock' | 'low-stock' | 'out-of-stock'
  sort: 'newest' | 'updated' | 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc'
}

type QuickPublicationStatus = 'published' | 'draft'
type ProductHighlightDraft = { is_clearance: boolean; is_best_seller: boolean; featured: boolean }

const columns = ['Thumbnail', 'Product Name', 'Brand', 'Category', 'Shipping Class', 'Price', 'Stock', 'Publication Status', 'Highlights', 'Actions']

function quickPublicationForProduct(product: Product): QuickPublicationStatus {
  return product.is_active ? 'published' : 'draft'
}

function quickPublicationLabel(status: QuickPublicationStatus) {
  return status === 'published' ? 'PUBLISHED' : 'DRAFT'
}

export function ProductsTable() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [savingStockId, setSavingStockId] = useState<string | null>(null)
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({})
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null)
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null)
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({})
  const [categoryTypeDrafts, setCategoryTypeDrafts] = useState<Record<string, GelBlasterType | ''>>({})
  const [editingShippingClassId, setEditingShippingClassId] = useState<string | null>(null)
  const [shippingClassDrafts, setShippingClassDrafts] = useState<Record<string, ShippingClass>>({})
  const [savingShippingClassId, setSavingShippingClassId] = useState<string | null>(null)
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null)
  const [statusDrafts, setStatusDrafts] = useState<Record<string, QuickPublicationStatus>>({})
  const [editingHighlightsId, setEditingHighlightsId] = useState<string | null>(null)
  const [savingHighlightsId, setSavingHighlightsId] = useState<string | null>(null)
  const [highlightDrafts, setHighlightDrafts] = useState<Record<string, ProductHighlightDraft>>({})
  const [variantCounts, setVariantCounts] = useState<Record<string, number>>({})
  const [variantSkus, setVariantSkus] = useState<Record<string, string[]>>({})
  const [filters, setFilters] = useState<ProductFilters>({ search: '', category: '', productType: '', publication: 'all', highlight: 'all', stock: 'all', sort: 'newest' })
  const stockSaveLock = useRef<string | null>(null)
  const priceSaveLock = useRef<string | null>(null)
  const categorySaveLock = useRef<string | null>(null)
  const shippingClassSaveLock = useRef<string | null>(null)
  const statusSaveLock = useRef<string | null>(null)
  const highlightsSaveLock = useRef<string | null>(null)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await fetchAdminProducts()
    if (queryError) setError(queryError.message)
    else {
      setProducts(((data ?? []) as Product[]).map((product) => ({ ...product, category: normalizeProductCategory(product.category) })))
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
        if (updatedProduct) setProducts((current) => current.map((product) => product.id === updatedProduct.id ? { ...updatedProduct, category: normalizeProductCategory(updatedProduct.category) } : product))
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

  function startEditingCategory(product: Product) {
    setError(null)
    setNotice(null)
    setCategoryDrafts((current) => ({ ...current, [product.id]: product.category }))
    setCategoryTypeDrafts((current) => ({ ...current, [product.id]: isGelBlasterType(product.product_type) ? product.product_type : '' }))
    setEditingCategoryId(product.id)
  }

  function cancelEditingCategory(product: Product) {
    setCategoryDrafts((current) => ({ ...current, [product.id]: product.category }))
    setCategoryTypeDrafts((current) => ({ ...current, [product.id]: isGelBlasterType(product.product_type) ? product.product_type : '' }))
    setEditingCategoryId(null)
    setError(null)
  }

  function updateCategoryDraft(product: Product, category: string) {
    setCategoryDrafts((current) => ({ ...current, [product.id]: category }))
    if (!isGelBlasterCategory(category)) setCategoryTypeDrafts((current) => ({ ...current, [product.id]: '' }))
  }

  async function saveCategory(product: Product, category: string, productType: GelBlasterType | '') {
    if (savingCategoryId === product.id || categorySaveLock.current === product.id) return
    if (!categories.includes(category)) {
      setError('Choose a valid category before saving.')
      return
    }
    if (isGelBlasterCategory(category) && !isGelBlasterType(productType)) {
      setError('Choose a Gel Blaster Type before saving this category.')
      return
    }

    const nextProductType = isGelBlasterCategory(category) ? productType : null
    if (category === product.category && nextProductType === product.product_type) {
      cancelEditingCategory(product)
      return
    }

    categorySaveLock.current = product.id
    setSavingCategoryId(product.id)
    setError(null)
    setNotice(null)
    try {
      await requireAdminSession()
      const { data, error: updateError } = await supabase
        .from('products')
        .update({ category, product_type: nextProductType, updated_at: new Date().toISOString() })
        .eq('id', product.id)
        .select('id,category,product_type')
        .single()
      if (updateError || !data) throw updateError ?? new Error('Category update did not return a product.')
      setProducts((current) => current.map((currentProduct) => currentProduct.id === product.id ? { ...currentProduct, category: data.category, product_type: data.product_type } : currentProduct))
      setCategoryDrafts((current) => ({ ...current, [product.id]: data.category }))
      setCategoryTypeDrafts((current) => ({ ...current, [product.id]: isGelBlasterType(data.product_type) ? data.product_type : '' }))
      setEditingCategoryId(null)
      markWebsiteChangesUnpublished()
      setNotice('Category saved. Publish the website to update the public storefront.')
    } catch (caught) {
      setError(`Category for ${product.name} was not saved. ${caught instanceof Error ? caught.message : 'Please try again.'}`)
    } finally {
      categorySaveLock.current = null
      setSavingCategoryId(null)
    }
  }

  function startEditingShippingClass(product: Product) { setError(null); setNotice(null); setShippingClassDrafts((current) => ({ ...current, [product.id]: normalizeShippingClass(product.shipping_class) })); setEditingShippingClassId(product.id) }
  function cancelEditingShippingClass(product: Product) { setShippingClassDrafts((current) => ({ ...current, [product.id]: normalizeShippingClass(product.shipping_class) })); setEditingShippingClassId(null); setError(null) }
  async function saveShippingClass(product: Product, shippingClass: ShippingClass) {
    if (savingShippingClassId === product.id || shippingClassSaveLock.current === product.id) return
    if (shippingClass === normalizeShippingClass(product.shipping_class)) { cancelEditingShippingClass(product); return }
    shippingClassSaveLock.current = product.id; setSavingShippingClassId(product.id); setError(null); setNotice(null)
    try {
      await requireAdminSession()
      const { data, error: updateError } = await supabase.from('products').update({ shipping_class: shippingClass, updated_at: new Date().toISOString() }).eq('id', product.id).select('id,shipping_class').single()
      if (updateError || !data) throw updateError ?? new Error('Shipping Class update did not return a product.')
      setProducts((current) => current.map((currentProduct) => currentProduct.id === product.id ? { ...currentProduct, shipping_class: normalizeShippingClass(data.shipping_class) } : currentProduct))
      setEditingShippingClassId(null); markWebsiteChangesUnpublished(); setNotice('Shipping Class saved. Publish the website to update the public storefront.')
    } catch (caught) { setError(`Shipping Class for ${product.name} was not saved. ${caught instanceof Error ? caught.message : 'Please try again.'}`) }
    finally { shippingClassSaveLock.current = null; setSavingShippingClassId(null) }
  }

  function startEditingStatus(product: Product) {
    setError(null)
    setNotice(null)
    setStatusDrafts((current) => ({ ...current, [product.id]: quickPublicationForProduct(product) }))
    setEditingStatusId(product.id)
  }

  function cancelEditingStatus(product: Product) {
    setStatusDrafts((current) => ({ ...current, [product.id]: quickPublicationForProduct(product) }))
    setEditingStatusId(null)
    setError(null)
  }

  async function saveStatus(product: Product, nextStatus: QuickPublicationStatus) {
    if (savingStatusId === product.id || statusSaveLock.current === product.id) return
    if (nextStatus === quickPublicationForProduct(product)) {
      cancelEditingStatus(product)
      return
    }

    const nextIsActive = nextStatus === 'published'
    statusSaveLock.current = product.id
    setSavingStatusId(product.id)
    setError(null)
    setNotice(null)
    try {
      await requireAdminSession()
      const { data, error: updateError } = await supabase
        .from('products')
        // Publication changes must never carry or infer an inventory value.
        .update({ is_active: nextIsActive, status: nextIsActive ? 'in_stock' : 'draft', updated_at: new Date().toISOString() })
        .eq('id', product.id)
        .select('id,is_active,status')
        .single()
      if (updateError || !data) throw updateError ?? new Error('Product status update did not return a product.')

      setProducts((current) => current.map((currentProduct) => currentProduct.id === product.id
        ? { ...currentProduct, is_active: data.is_active, status: data.status as Product['status'] }
        : currentProduct))
      setStatusDrafts((current) => ({ ...current, [product.id]: data.is_active ? 'published' : 'draft' }))
      setEditingStatusId(null)
      markWebsiteChangesUnpublished()
      setNotice(`Publication Status saved as ${data.is_active ? 'PUBLISHED' : 'DRAFT'}. Publish the website to update the public storefront.`)
    } catch (caught) {
      setStatusDrafts((current) => ({ ...current, [product.id]: quickPublicationForProduct(product) }))
      setError(`Publication Status for ${product.name} was not saved. ${caught instanceof Error ? caught.message : 'Please try again.'}`)
    } finally {
      statusSaveLock.current = null
      setSavingStatusId(null)
    }
  }

  function highlightDraftForProduct(product: Product): ProductHighlightDraft {
    return { is_clearance: Boolean(product.is_clearance), is_best_seller: Boolean(product.is_best_seller), featured: Boolean(product.featured) }
  }

  function startEditingHighlights(product: Product) {
    setError(null)
    setNotice(null)
    setHighlightDrafts((current) => ({ ...current, [product.id]: highlightDraftForProduct(product) }))
    setEditingHighlightsId(product.id)
  }

  function cancelEditingHighlights(product: Product) {
    setHighlightDrafts((current) => ({ ...current, [product.id]: highlightDraftForProduct(product) }))
    setEditingHighlightsId(null)
    setError(null)
  }

  async function saveHighlights(product: Product, draft: ProductHighlightDraft) {
    if (savingHighlightsId === product.id || highlightsSaveLock.current === product.id) return
    const current = highlightDraftForProduct(product)
    if (draft.is_clearance === current.is_clearance && draft.is_best_seller === current.is_best_seller && draft.featured === current.featured) {
      cancelEditingHighlights(product)
      return
    }

    highlightsSaveLock.current = product.id
    setSavingHighlightsId(product.id)
    setError(null)
    setNotice(null)
    try {
      await requireAdminSession()
      const { data, error: updateError } = await supabase
        .from('products')
        .update({ ...draft, updated_at: new Date().toISOString() })
        .eq('id', product.id)
        .select('id,is_clearance,is_best_seller,featured')
        .single()
      if (updateError || !data) throw updateError ?? new Error('Product highlights update did not return a product.')

      setProducts((currentProducts) => currentProducts.map((currentProduct) => currentProduct.id === product.id
        ? { ...currentProduct, is_clearance: data.is_clearance, is_best_seller: data.is_best_seller, featured: data.featured }
        : currentProduct))
      setHighlightDrafts((currentDrafts) => ({ ...currentDrafts, [product.id]: { is_clearance: data.is_clearance, is_best_seller: data.is_best_seller, featured: data.featured } }))
      setEditingHighlightsId(null)
      markWebsiteChangesUnpublished()
      setNotice('Product highlights saved. Publish the website to update the public storefront.')
    } catch (caught) {
      setHighlightDrafts((currentDrafts) => ({ ...currentDrafts, [product.id]: highlightDraftForProduct(product) }))
      setError(`Highlights for ${product.name} were not saved. ${caught instanceof Error ? caught.message : 'Please try again.'}`)
    } finally {
      highlightsSaveLock.current = null
      setSavingHighlightsId(null)
    }
  }

  function stockStatus(stock: number) {
    if (stock >= 5) return { label: 'In Stock', tone: styles.stockHealthy }
    if (stock >= 3) return { label: 'Low Stock', tone: styles.stockLow }
    if (stock >= 1) return { label: 'Very Low Stock', tone: styles.stockVeryLow }
    return { label: 'Out of Stock', tone: styles.stockOut }
  }

  const categories = useMemo(() => {
    const existingCategories = Array.from(new Set(products.map((product) => product.category)))
      .filter((category) => !productCategoryOptions.includes(category as typeof productCategoryOptions[number]))
      .sort((first, second) => first.localeCompare(second))
    return [...productCategoryOptions, ...existingCategories]
  }, [products])
  const visibleProducts = useMemo(() => {
    const query = filters.search.trim().toLocaleLowerCase()
    const filtered = products.filter((product) => {
      const matchesSearch = !query || [product.name, product.brand ?? '', product.slug, ...(variantSkus[product.id] ?? [])]
        .some((value) => value.toLocaleLowerCase().includes(query))
      const matchesCategory = !filters.category || product.category === filters.category
      const matchesType = !filters.productType || product.product_type === filters.productType
      const matchesPublication = filters.publication === 'all' || (filters.publication === 'published' ? product.is_active : !product.is_active)
      const matchesHighlight = filters.highlight === 'all'
        || (filters.highlight === 'clearance_sale' && product.is_clearance)
        || (filters.highlight === 'best_seller' && product.is_best_seller)
        || (filters.highlight === 'featured' && product.featured)
      const matchesStock = filters.stock === 'all'
        || (filters.stock === 'in-stock' && product.stock >= 5)
        || (filters.stock === 'low-stock' && product.stock >= 1 && product.stock <= 4)
        || (filters.stock === 'out-of-stock' && product.stock === 0)
      return matchesSearch && matchesCategory && matchesType && matchesPublication && matchesHighlight && matchesStock
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
    setFilters({ search: '', category: '', productType: '', publication: 'all', highlight: 'all', stock: 'all', sort: 'newest' })
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
            <label>Publication Status<select value={filters.publication} onChange={(event) => updateFilter('publication', event.target.value as ProductFilters['publication'])}><option value="all">All Publication Statuses</option><option value="published">Published</option><option value="inactive">Draft</option></select></label>
            <label>Highlights<select value={filters.highlight} onChange={(event) => updateFilter('highlight', event.target.value as ProductFilters['highlight'])}><option value="all">All Highlights</option><option value="clearance_sale">Clearance Sale</option><option value="best_seller">Best Seller</option><option value="featured">Featured</option></select></label>
            <label>Stock<select value={filters.stock} onChange={(event) => updateFilter('stock', event.target.value as ProductFilters['stock'])}><option value="all">All Stock</option><option value="in-stock">In Stock (5+)</option><option value="low-stock">Low Stock (1–4)</option><option value="out-of-stock">Out of Stock</option></select></label>
            <label>Sort<select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value as ProductFilters['sort'])}><option value="newest">Newest Added</option><option value="updated">Recently Updated</option><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="price-asc">Price Low–High</option><option value="price-desc">Price High–Low</option></select></label>
          </div>
          <button type="button" className={styles.clearProductFilters} onClick={clearFilters}>Clear Filters</button>
        </div>
        {visibleProducts.length === 0 ? <div className={styles.emptyState}><div><p>No products found.</p><button type="button" className={styles.tableAction} onClick={clearFilters}>Clear Filters</button></div></div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{visibleProducts.map((product) => {
        const isWorking = workingId === product.id
        const stockIsSaving = savingStockId === product.id
        const priceIsSaving = savingPriceId === product.id
        const priceIsEditing = editingPriceId === product.id
        const categoryIsSaving = savingCategoryId === product.id
        const categoryIsEditing = editingCategoryId === product.id
        const stockInfo = stockStatus(product.stock)
        const stockDraft = stockDrafts[product.id] ?? String(product.stock)
        const priceDraft = priceDrafts[product.id] ?? String(Number(product.price))
        const categoryDraft = categoryDrafts[product.id] ?? product.category
        const categoryTypeDraft = categoryTypeDrafts[product.id] ?? (isGelBlasterType(product.product_type) ? product.product_type : '')
        const shippingClassIsEditing = editingShippingClassId === product.id
        const shippingClassIsSaving = savingShippingClassId === product.id
        const shippingClassDraft = shippingClassDrafts[product.id] ?? normalizeShippingClass(product.shipping_class)
        const statusIsEditing = editingStatusId === product.id
        const statusIsSaving = savingStatusId === product.id
        const statusDraft = statusDrafts[product.id] ?? quickPublicationForProduct(product)
        const highlightsIsEditing = editingHighlightsId === product.id
        const highlightsIsSaving = savingHighlightsId === product.id
        const highlightsDraft = highlightDrafts[product.id] ?? highlightDraftForProduct(product)
        const highlightLabels = [product.is_clearance ? 'Clearance' : '', product.is_best_seller ? 'Best Seller' : '', product.featured ? 'Featured' : ''].filter(Boolean)
        return <tr key={product.id}>
          <td>{product.image_urls[0] ? <img className={styles.tableImage} src={product.image_urls[0]} alt="" /> : <div className={styles.thumbnail}>Image</div>}</td>
          <td>{product.name}</td>
          <td className={styles.placeholderText}>{product.brand ?? '—'}</td>
          <td>{categoryIsEditing ? <div className={styles.categoryEditor}><select aria-label={`${product.name} category`} value={categoryDraft} disabled={categoryIsSaving} onChange={(event) => updateCategoryDraft(product, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveCategory(product, categoryDraft, categoryTypeDraft) } if (event.key === 'Escape') { event.preventDefault(); cancelEditingCategory(product) } }}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>{isGelBlasterCategory(categoryDraft) && <select aria-label={`${product.name} Gel Blaster Type`} value={categoryTypeDraft} disabled={categoryIsSaving} onChange={(event) => setCategoryTypeDrafts((current) => ({ ...current, [product.id]: event.target.value as GelBlasterType | '' }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveCategory(product, categoryDraft, categoryTypeDraft) } if (event.key === 'Escape') { event.preventDefault(); cancelEditingCategory(product) } }}><option value="">Select Type</option>{GEL_BLASTER_TYPES.map((productType) => <option key={productType} value={productType}>{gelBlasterTypeFilterLabels[productType]}</option>)}</select>}<div><button type="button" disabled={categoryIsSaving} onClick={() => void saveCategory(product, categoryDraft, categoryTypeDraft)}>{categoryIsSaving ? 'Saving…' : 'Save'}</button><button type="button" disabled={categoryIsSaving} onClick={() => cancelEditingCategory(product)}>Cancel</button></div></div> : <div className={styles.categoryDisplay}><span>{product.category}</span><button type="button" className={styles.priceEditAction} aria-label={`Edit ${product.name} category`} title="Quick edit category" onClick={() => startEditingCategory(product)}>✎</button></div>}</td>
          <td>{shippingClassIsEditing ? <div className={styles.categoryEditor}><select aria-label={`${product.name} Shipping Class`} value={shippingClassDraft} disabled={shippingClassIsSaving} onChange={(event) => setShippingClassDrafts((current) => ({ ...current, [product.id]: event.target.value as ShippingClass }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveShippingClass(product, shippingClassDraft) } if (event.key === 'Escape') { event.preventDefault(); cancelEditingShippingClass(product) } }}>{shippingClassOptions.map((shippingClass) => <option key={shippingClass.value} value={shippingClass.value}>{shippingClass.value}</option>)}</select><div><button type="button" disabled={shippingClassIsSaving} onClick={() => void saveShippingClass(product, shippingClassDraft)}>{shippingClassIsSaving ? 'Saving…' : 'Save'}</button><button type="button" disabled={shippingClassIsSaving} onClick={() => cancelEditingShippingClass(product)}>Cancel</button></div></div> : <div className={styles.categoryDisplay}><span>{normalizeShippingClass(product.shipping_class)}</span><button type="button" className={styles.priceEditAction} aria-label={`Edit ${product.name} Shipping Class`} title="Quick edit Shipping Class" onClick={() => startEditingShippingClass(product)}>✎</button></div>}</td>
          <td>{product.has_variants ? <div className={styles.variantPriceSummary}><strong>From {formatPrice(product.price)}</strong><a className={styles.tableAction} href={`/admin/products/edit?id=${product.id}`}>Edit Variant Prices</a></div> : priceIsEditing ? <div className={styles.priceEditor}><input aria-label={`${product.name} price`} type="text" inputMode="decimal" value={priceDraft} disabled={priceIsSaving} onChange={(event) => setPriceDrafts((current) => ({ ...current, [product.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void savePrice(product, priceDraft) } if (event.key === 'Escape') { event.preventDefault(); cancelEditingPrice(product) } }} /><div><button type="button" disabled={priceIsSaving} onClick={() => void savePrice(product, priceDraft)}>{priceIsSaving ? 'Saving…' : 'Save'}</button><button type="button" disabled={priceIsSaving} onClick={() => cancelEditingPrice(product)}>Cancel</button></div></div> : <div className={styles.priceDisplay}><strong>{formatPrice(product.price)}</strong><button type="button" className={styles.priceEditAction} aria-label={`Edit ${product.name} price`} title="Quick edit price" onClick={() => startEditingPrice(product)}>✎</button></div>}</td>
          <td>{product.has_variants ? <div className={styles.variantStockSummary}><span>{variantCounts[product.id] ?? 0} Variant{variantCounts[product.id] === 1 ? '' : 's'}</span><strong>{product.stock} total</strong><a className={styles.tableAction} href={`/admin/products/edit?id=${product.id}`}>Manage Variants</a></div> : <div className={styles.stockControl}><div><button type="button" aria-label={`Decrease ${product.name} stock`} disabled={stockIsSaving || product.stock === 0} onClick={() => void saveStock(product, String(product.stock - 1))}>−</button><input aria-label={`${product.name} stock`} inputMode="numeric" pattern="[0-9]*" value={stockDraft} disabled={stockIsSaving} onChange={(event) => setStockDrafts((current) => ({ ...current, [product.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveStock(product, stockDraft) } if (event.key === 'Escape') { event.preventDefault(); setStockDrafts((current) => ({ ...current, [product.id]: String(product.stock) })); event.currentTarget.blur() } }} onBlur={() => { if (stockDraft !== String(product.stock)) void saveStock(product, stockDraft) }} /><button type="button" aria-label={`Increase ${product.name} stock`} disabled={stockIsSaving} onClick={() => void saveStock(product, String(product.stock + 1))}>+</button></div><span className={stockInfo.tone}>{stockIsSaving ? 'Saving…' : stockInfo.label}</span></div>}</td>
          <td>{statusIsEditing ? <div className={styles.categoryEditor}><select aria-label={`${product.name} Publication Status`} value={statusDraft} disabled={statusIsSaving} onChange={(event) => setStatusDrafts((current) => ({ ...current, [product.id]: event.target.value as QuickPublicationStatus }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveStatus(product, statusDraft) } if (event.key === 'Escape') { event.preventDefault(); cancelEditingStatus(product) } }}><option value="published">PUBLISHED</option><option value="draft">DRAFT</option></select><div><button type="button" disabled={statusIsSaving} onClick={() => void saveStatus(product, statusDraft)}>{statusIsSaving ? 'Saving…' : 'Save'}</button><button type="button" disabled={statusIsSaving} onClick={() => cancelEditingStatus(product)}>Cancel</button></div></div> : <div className={styles.categoryDisplay}><span className={`${styles.status} ${product.is_active ? styles.statusActive : ''}`}>{quickPublicationLabel(quickPublicationForProduct(product))}</span><button type="button" className={styles.priceEditAction} aria-label={`Edit ${product.name} Publication Status`} title="Quick edit Publication Status" disabled={isWorking} onClick={() => startEditingStatus(product)}>✎</button></div>}</td>
          <td>{highlightsIsEditing ? <div className={styles.highlightsEditor}><label><input type="checkbox" checked={highlightsDraft.is_clearance} disabled={highlightsIsSaving} onChange={(event) => setHighlightDrafts((current) => ({ ...current, [product.id]: { ...highlightsDraft, is_clearance: event.target.checked } }))} />Clearance Sale</label><label><input type="checkbox" checked={highlightsDraft.is_best_seller} disabled={highlightsIsSaving} onChange={(event) => setHighlightDrafts((current) => ({ ...current, [product.id]: { ...highlightsDraft, is_best_seller: event.target.checked } }))} />Best Seller</label><label><input type="checkbox" checked={highlightsDraft.featured} disabled={highlightsIsSaving} onChange={(event) => setHighlightDrafts((current) => ({ ...current, [product.id]: { ...highlightsDraft, featured: event.target.checked } }))} />Featured</label><div><button type="button" disabled={highlightsIsSaving} onClick={() => void saveHighlights(product, highlightsDraft)}>{highlightsIsSaving ? 'Saving…' : 'Save'}</button><button type="button" disabled={highlightsIsSaving} onClick={() => cancelEditingHighlights(product)}>Cancel</button></div></div> : <div className={styles.highlightsDisplay}><span className={styles.highlightSummary}>{highlightLabels.length ? highlightLabels.join(' · ') : 'None'}</span><button type="button" className={styles.priceEditAction} aria-label={`Edit ${product.name} highlights`} title="Quick edit highlights" disabled={isWorking} onClick={() => startEditingHighlights(product)}>✎</button></div>}</td>
          <td><div className={styles.tableActions}><a className={styles.tableAction} href={`/admin/products/edit?id=${product.id}`}>Edit</a><button className={styles.tableAction} type="button" disabled={isWorking} onClick={() => duplicateProduct(product)}>{isWorking ? 'Working…' : 'Duplicate'}</button><button className={`${styles.tableAction} ${styles.deleteAction}`} type="button" disabled={isWorking} onClick={() => deleteProduct(product)}>{isWorking ? 'Working…' : 'Delete'}</button></div></td>
        </tr>
      })}</tbody></table></div>}
      </>}
    </section>
  )
}
