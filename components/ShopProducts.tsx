'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { fetchActiveProducts } from '../lib/supabase/products'
import { ProductCard, type PublicProduct } from './ProductCard'
import { getProductUrl } from '../lib/products/get-product-url'
import { ShopFloatingCheckout } from './ShopFloatingCheckout'
import { GEL_BLASTER_TYPES, gelBlasterTypeFilterLabels, isGelBlasterCategory, parseGelBlasterType, type GelBlasterType } from '../lib/products/product-types'
import { normalizeProductCategory, sortShopCategories } from '../lib/products/category-order'
import { ShopCategoryShelf } from './ShopCategoryShelf'
import { isNewArrival } from '../lib/products/highlights'

type SortOption = 'newest' | 'price-asc' | 'price-desc' | 'name-asc'
type HighlightFilter = '' | 'new_arrival' | 'clearance_sale' | 'best_seller'
type ShopProduct = PublicProduct & {
  created_at: string
  short_description: string | null
}

type ShopFilters = {
  search: string
  category: string
  productType: GelBlasterType | ''
  brand: string
  highlight: HighlightFilter
  sort: SortOption
}

const defaultShopFilters: ShopFilters = { search: '', category: '', productType: '', brand: '', highlight: '', sort: 'newest' }
const SHOP_BATCH_SIZE = 12

function filtersFromUrl(params: Pick<URLSearchParams, 'get'>): ShopFilters {
  const sort = params.get('sort')
  const validSort: SortOption[] = ['newest', 'price-asc', 'price-desc', 'name-asc']
  const validHighlights: HighlightFilter[] = ['', 'new_arrival', 'clearance_sale', 'best_seller']
  const category = normalizeProductCategory(params.get('category') ?? '')
  const productType = params.get('type') ?? ''
  return {
    search: params.get('search') ?? '',
    category,
    productType: isGelBlasterCategory(category) ? parseGelBlasterType(productType) : '',
    brand: params.get('brand') ?? '',
    highlight: validHighlights.includes(params.get('highlight') as HighlightFilter) ? params.get('highlight') as HighlightFilter : '',
    sort: validSort.includes(sort as SortOption) ? sort as SortOption : 'newest',
  }
}

function updateShopUrl(filters: ShopFilters) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.category) params.set('category', filters.category)
  if (filters.category && isGelBlasterCategory(filters.category) && filters.productType) params.set('type', filters.productType.toLocaleLowerCase())
  if (filters.brand) params.set('brand', filters.brand)
  if (filters.highlight) params.set('highlight', filters.highlight)
  if (filters.sort !== 'newest') params.set('sort', filters.sort)
  const query = params.toString()
  window.history.replaceState({}, '', query ? `/shop?${query}` : '/shop')
}

export function ShopProducts() {
  const searchParams = useSearchParams()
  const searchQuery = searchParams.toString()
  const [products, setProducts] = useState<ShopProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ShopFilters>(defaultShopFilters)
  const [urlReady, setUrlReady] = useState(false)
  const [visibleCount, setVisibleCount] = useState(SHOP_BATCH_SIZE)
  const isApplyingUrlState = useRef(false)

  useEffect(() => {
    isApplyingUrlState.current = true
    const queryParams = new URLSearchParams(searchQuery)
    const nextFilters = filtersFromUrl(queryParams)
    setFilters(nextFilters)
    // `status` was an old public filter for an internal admin field. Ignore it
    // completely and clean legacy links without changing the visible catalogue.
    // `featured` is deliberately retired rather than being reinterpreted as
    // New Arrivals: the two manual product states are not equivalent.
    if (queryParams.has('status') || queryParams.get('highlight') === 'featured') updateShopUrl(nextFilters)
    setUrlReady(true)
  }, [searchQuery])

  const loadProducts = useCallback(async () => {
    const { data, error: queryError } = await fetchActiveProducts()

    if (queryError) setError(queryError.message)
    else {
      const currentProducts = ((data ?? []) as ShopProduct[]).map((product) => ({ ...product, category: normalizeProductCategory(product.category) }))
      setProducts(currentProducts)
      setError(null)
      const product = currentProducts[0]
      if (product) {
        console.log('Current slug:', product.slug)
        console.log('Generated href:', getProductUrl(product))
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadProducts()
    window.addEventListener('hydro-products-updated', loadProducts)
    window.addEventListener('focus', loadProducts)
    window.addEventListener('storage', loadProducts)
    return () => {
      window.removeEventListener('hydro-products-updated', loadProducts)
      window.removeEventListener('focus', loadProducts)
      window.removeEventListener('storage', loadProducts)
    }
  }, [loadProducts])

  useEffect(() => {
    if (!urlReady) return
    if (isApplyingUrlState.current) {
      isApplyingUrlState.current = false
      return
    }
    updateShopUrl(filters)
  }, [filters, urlReady])

  useEffect(() => { setVisibleCount(SHOP_BATCH_SIZE) }, [filters])

  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category))).sort((a, b) => a.localeCompare(b)), [products])
  const brands = useMemo(() => Array.from(new Set(products.map((product) => product.brand).filter((brand): brand is string => Boolean(brand)))).sort((a, b) => a.localeCompare(b)), [products])
  const matchingProducts = useMemo(() => {
    const query = filters.search.trim().toLocaleLowerCase()
    const filtered = products.filter((product) => {
      const matchesSearch = !query || [product.name, product.brand ?? '', product.category, product.product_type ?? '', product.short_description ?? ''].some((value) => value.toLocaleLowerCase().includes(query))
      const matchesHighlight = !filters.highlight
        || (filters.highlight === 'new_arrival' && isNewArrival(product))
        || (filters.highlight === 'clearance_sale' && Boolean(product.is_clearance))
        || (filters.highlight === 'best_seller' && Boolean(product.is_best_seller))
      return matchesSearch && matchesHighlight && (!filters.category || product.category === filters.category) && (!filters.productType || product.product_type === filters.productType) && (!filters.brand || product.brand === filters.brand)
    })

    return [...filtered].sort((first, second) => {
      if (filters.sort === 'price-asc') return Number(first.price) - Number(second.price)
      if (filters.sort === 'price-desc') return Number(second.price) - Number(first.price)
      if (filters.sort === 'name-asc') return first.name.localeCompare(second.name)
      if (filters.sort === 'newest') return new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
      return new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
    })
  }, [products, filters])

  const isDefaultShelfMode = !filters.search.trim() && !filters.category && !filters.productType && !filters.brand && !filters.highlight && filters.sort === 'newest'
  const activeFilterChips = useMemo(() => {
    const chips: { key: 'search' | 'category' | 'productType' | 'brand' | 'highlight' | 'sort'; label: string }[] = []
    if (filters.search.trim()) chips.push({ key: 'search', label: `Search: ${filters.search.trim()}` })
    if (filters.category) chips.push({ key: 'category', label: filters.category })
    if (filters.productType) chips.push({ key: 'productType', label: filters.productType })
    if (filters.brand) chips.push({ key: 'brand', label: filters.brand })
    if (filters.highlight) chips.push({ key: 'highlight', label: filters.highlight.replaceAll('_', ' ') })
    if (filters.sort !== 'newest') chips.push({ key: 'sort', label: `Sort: ${filters.sort.replaceAll('-', ' ')}` })
    return chips
  }, [filters])
  const filteredResultsTitle = filters.category || (filters.search.trim() ? 'Search results' : 'Filtered products')
  const categoryShelves = useMemo(() => {
    const productsByCategory = new Map<string, ShopProduct[]>()
    for (const product of matchingProducts) {
      const current = productsByCategory.get(product.category) ?? []
      current.push(product)
      productsByCategory.set(product.category, current)
    }

    return sortShopCategories(Array.from(productsByCategory.keys())).map((category) => ({
      category,
      products: productsByCategory.get(category) ?? [],
    }))
  }, [matchingProducts])
  const visibleFilteredProducts = matchingProducts.slice(0, visibleCount)

  function updateFilter<K extends keyof ShopFilters>(field: K, value: ShopFilters[K]) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  function updateCategory(category: string) {
    setFilters((current) => ({ ...current, category, productType: isGelBlasterCategory(category) ? current.productType : '' }))
  }

  function clearAllFilters() {
    setFilters({ ...defaultShopFilters })
  }

  function clearSingleFilter(field: 'search' | 'category' | 'productType' | 'brand' | 'highlight' | 'sort') {
    setFilters((current) => {
      if (field === 'category') return { ...current, category: '', productType: '' }
      if (field === 'productType') return { ...current, productType: '' }
      if (field === 'sort') return { ...current, sort: 'newest' }
      return { ...current, [field]: '' }
    })
  }

  if (loading) return <div className="catalogue-state">Loading products…</div>
  if (error) return <div className="catalogue-state" role="alert">Products are unavailable right now. Please try again later.</div>
  if (products.length === 0) return <div className="catalogue-state">There are no active products to display yet. Please check back soon.</div>

  return <div className="shop-catalogue">
    <div className="shop-controls" aria-label="Product search and filters">
      <div className="shop-search"><label htmlFor="product-search">Search products</label><div><input id="product-search" type="search" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search name, brand, category…" />{filters.search && <button type="button" onClick={() => updateFilter('search', '')}>Clear search</button>}</div></div>
      <div className="shop-filter-grid">
        <label className={filters.category ? 'shop-filter-field-active' : undefined}>Category<select value={filters.category} onChange={(event) => updateCategory(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        {isGelBlasterCategory(filters.category) && <label className={filters.productType ? 'shop-filter-field-active' : undefined}>Type<select value={filters.productType} onChange={(event) => updateFilter('productType', event.target.value as GelBlasterType | '')}><option value="">All</option>{GEL_BLASTER_TYPES.map((productType) => <option key={productType} value={productType}>{gelBlasterTypeFilterLabels[productType]}</option>)}</select></label>}
        <label className={filters.brand ? 'shop-filter-field-active' : undefined}>Brand<select value={filters.brand} onChange={(event) => updateFilter('brand', event.target.value)}><option value="">All brands</option>{brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select></label>
        <label className={filters.highlight ? 'shop-filter-field-active' : undefined}>Highlights<select value={filters.highlight} onChange={(event) => updateFilter('highlight', event.target.value as HighlightFilter)}><option value="">All highlights</option><option value="new_arrival">New Arrivals</option><option value="best_seller">Best Seller</option><option value="clearance_sale">Clearance Sale</option></select></label>
        <label className={filters.sort !== 'newest' ? 'shop-filter-field-active' : undefined}>Sort<select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value as SortOption)}><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="name-asc">Name: A to Z</option></select></label>
      </div>
      <button className="clear-filters" type="button" onClick={clearAllFilters}>Clear all filters</button>
    </div>
    {!isDefaultShelfMode ? <section className="shop-filtered-state" aria-label="Active shop filters"><div className="shop-filtered-state-heading"><div><p className="eyebrow">Filtered products</p><h2>{filteredResultsTitle}</h2><p>{matchingProducts.length} product{matchingProducts.length === 1 ? '' : 's'}</p></div><button type="button" onClick={clearAllFilters}>← Back to all categories</button></div>{activeFilterChips.length > 0 && <div className="shop-active-filter-chips" aria-label="Active filters">{activeFilterChips.map((chip) => <button type="button" key={chip.key} onClick={() => clearSingleFilter(chip.key)}>{chip.label} <span aria-hidden="true">×</span><span className="sr-only">Remove filter</span></button>)}</div>}</section> : <div className="shop-filter-status"><span>{matchingProducts.length} product{matchingProducts.length === 1 ? '' : 's'}</span></div>}
    {matchingProducts.length > 0 ? isDefaultShelfMode ? <div className="shop-category-shelves">{categoryShelves.map((shelf) => <ShopCategoryShelf category={shelf.category} products={shelf.products} key={shelf.category} />)}</div> : <><div className="product-grid">{visibleFilteredProducts.map((product, index) => <ProductCard product={product} eagerImage={index < 4} key={product.id} />)}</div>{visibleCount < matchingProducts.length && <div className="product-list-more"><button className="secondary-button" type="button" onClick={() => setVisibleCount((count) => count + SHOP_BATCH_SIZE)}>Load More</button></div>}</> : <div className="catalogue-state">No active products match your current search and filters. Try clearing a filter or searching for something else.</div>}
    <ShopFloatingCheckout />
  </div>
}
