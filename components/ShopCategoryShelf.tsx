'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ProductCard, type PublicProduct } from './ProductCard'

type ShopCategoryShelfProps = {
  category: string
  products: PublicProduct[]
  eagerImageIds?: Set<string>
}

export function ShopCategoryShelf({ category, products, eagerImageIds = new Set() }: ShopCategoryShelfProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [canScroll, setCanScroll] = useState(false)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  const updateScrollState = useCallback(() => {
    const row = rowRef.current
    if (!row) return
    const hasOverflow = row.scrollWidth > row.clientWidth + 1
    setCanScroll(hasOverflow)
    setAtStart(row.scrollLeft <= 1)
    setAtEnd(!hasOverflow || row.scrollLeft + row.clientWidth >= row.scrollWidth - 1)
  }, [])

  useEffect(() => {
    updateScrollState()
    const row = rowRef.current
    if (!row) return
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(row)
    return () => observer.disconnect()
  }, [products.length, updateScrollState])

  function scrollShelf(direction: 1 | -1) {
    const row = rowRef.current
    if (!row) return
    row.scrollBy({ left: direction * Math.round(row.clientWidth * 0.82), behavior: 'smooth' })
  }

  const viewAllHref = `/shop?category=${encodeURIComponent(category)}`

  return <section className="shop-category-shelf" aria-labelledby={`shop-category-${category}`}>
    <header className="shop-category-shelf-header">
      <div>
        <h2 id={`shop-category-${category}`}>{category}</h2>
        <p>{products.length} product{products.length === 1 ? '' : 's'}</p>
      </div>
      <div className="shop-category-shelf-actions">
        {canScroll && <div className="shop-shelf-scroll-controls" aria-label={`Scroll ${category} products`}>
          <button type="button" aria-label={`Show earlier ${category} products`} disabled={atStart} onClick={() => scrollShelf(-1)}>←</button>
          <button type="button" aria-label={`Show more ${category} products`} disabled={atEnd} onClick={() => scrollShelf(1)}>→</button>
        </div>}
        <Link href={viewAllHref} aria-label={`View all ${category} products`}>View all <span aria-hidden="true">→</span></Link>
      </div>
    </header>
    <div className="shop-category-shelf-row" ref={rowRef} onScroll={updateScrollState}>
      {products.map((product) => <ProductCard product={product} eagerImage={eagerImageIds.has(product.id)} key={product.id} />)}
    </div>
  </section>
}
