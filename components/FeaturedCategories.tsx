'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'

export function FeaturedCategories() {
  const [categories, setCategories] = useState<string[]>([])

  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase.from('products').select('category').eq('is_active', true)
      const uniqueCategories = Array.from(new Set((data ?? []).map((product) => product.category).filter(Boolean)))
      setCategories(uniqueCategories)
    }
    loadCategories()
  }, [])

  if (categories.length === 0) return <div className="catalogue-state">Categories will appear when active products are available.</div>

  return <div className="category-grid">
    {categories.map((category) => <a className="category-card" href={`/shop?category=${encodeURIComponent(category)}`} key={category}><div className="category-placeholder">Image placeholder</div><div><h3>{category}</h3><span>Explore category →</span></div></a>)}
  </div>
}
