'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase/client'
import { ProductCard, type PublicProduct } from './ProductCard'

type SortOption = 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'name-asc'
type ShopProduct = PublicProduct & {
  featured: boolean
  created_at: string
  short_description: string | null
}

type ShopFilters = {
  search: string
  category: string
  brand: string
  status: string
  sort: SortOption
}

function filtersFromUrl(): ShopFilters {
  const params = new URLSearchParams(window.location.search)
  const sort = params.get('sort')
  const validSort: SortOption[] = ['featured', 'newest', 'price-asc', 'price-desc', 'name-asc']
  return {
    search: params.get('search') ?? '',
    category: params.get('category') ?? '',
    brand: params.get('brand') ?? '',
    status: params.get('status') ?? '',
    sort: validSort.includes(sort as SortOption) ? sort as SortOption : 'featured',
  }
}

function updateShopUrl(filters: ShopFilters) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.category) params.set('category', filters.category)
  if (filters.brand) params.set('brand', filters.brand)
  if (filters.status) params.set('status', filters.status)
  if (filters.sort !== 'featured') params.set('sort', filters.sort)
  const query = params.toString()
  window.history.replaceState({}, '', query ? `/shop?${query}` : '/shop')
}

export function ShopProducts() {
  const [products, setProducts] = useState<ShopProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ShopFilters>({ search: '', category: '', brand: '', status: '', sort: 'featured' })
  const [urlReady, setUrlReady] = useState(false)

  useEffect(() => {
    setFilters(filtersFromUrl())
    setUrlReady(true)
  }, [])

  useEffect(() => {
    async function loadProducts() {
      const { data, error: queryError } = await supabase
        .from('products')
        .select('id,name,slug,brand,category,price,stock,status,image_urls,featured,created_at,short_description')
        .eq('is_active', true)

      if (queryError) setError(queryError.message)
      else setProducts((data ?? []) as ShopProduct[])
      setLoading(false)
    }
    loadProducts()
  }, [])

  useEffect(() => {
    if (urlReady) updateShopUrl(filters)
  }, [filters, urlReady])

  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category))).sort((a, b) => a.localeCompare(b)), [products])
  const brands = useMemo(() => Array.from(new Set(products.map((product) => product.brand).filter((brand): brand is string => Boolean(brand)))).sort((a, b) => a.localeCompare(b)), [products])
  const statuses = useMemo(() => Array.from(new Set(products.map((product) => product.status))), [products])

  const matchingProducts = useMemo(() => {
    const query = filters.search.trim().toLocaleLowerCase()
    const filtered = products.filter((product) => {
      const matchesSearch = !query || [product.name, product.brand ?? '', product.category, product.short_description ?? ''].some((value) => value.toLocaleLowerCase().includes(query))
      return matchesSearch && (!filters.category || product.category === filters.category) && (!filters.brand || product.brand === filters.brand) && (!filters.status || product.status === filters.status)
    })

    return [...filtered].sort((first, second) => {
      if (filters.sort === 'price-asc') return Number(first.price) - Number(second.price)
      if (filters.sort === 'price-desc') return Number(second.price) - Number(first.price)
      if (filters.sort === 'name-asc') return first.name.localeCompare(second.name)
      if (filters.sort === 'newest') return new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
      return Number(second.featured) - Number(first.featured) || new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
    })
  }, [products, filters])

  function updateFilter<K extends keyof ShopFilters>(field: K, value: ShopFilters[K]) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  function clearAllFilters() {
    setFilters({ search: '', category: '', brand: '', status: '', sort: 'featured' })
  }

  if (loading) return <div className="catalogue-state">Loading products…</div>
  if (error) return <div className="catalogue-state" role="alert">Products are unavailable right now. Please try again later.</div>
  if (products.length === 0) return <div className="catalogue-state">There are no active products to display yet. Please check back soon.</div>

  return <div className="shop-catalogue">
    <div className="shop-controls" aria-label="Product search and filters">
      <div className="shop-search"><label htmlFor="product-search">Search products</label><div><input id="product-search" type="search" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search name, brand, category…" />{filters.search && <button type="button" onClick={() => updateFilter('search', '')}>Clear search</button>}</div></div>
      <div className="shop-filter-grid">
        <label>Category<select value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        <label>Brand<select value={filters.brand} onChange={(event) => updateFilter('brand', event.target.value)}><option value="">All brands</option>{brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select></label>
        <label>Status<select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
        <label>Sort<select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value as SortOption)}><option value="featured">Featured first</option><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="name-asc">Name: A to Z</option></select></label>
      </div>
      <button className="clear-filters" type="button" onClick={clearAllFilters}>Clear all filters</button>
    </div>
    <div className="shop-filter-status"><span>{matchingProducts.length} product{matchingProducts.length === 1 ? '' : 's'}{filters.category ? ` in ${filters.category}` : ''}</span></div>
    {matchingProducts.length > 0 ? <div className="product-grid">{matchingProducts.map((product) => <ProductCard product={product} key={product.id} />)}</div> : <div className="catalogue-state">No active products match your current search and filters. Try clearing a filter or searching for something else.</div>}
  </div>
}
