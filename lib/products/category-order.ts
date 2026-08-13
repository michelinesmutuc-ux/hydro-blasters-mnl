// Keep the Shop landing shelves in a merchant-friendly order. Categories not
// listed here still appear after these in their existing product order.
export const productCategoryOptions = [
  'Gel Blaster',
  'SQB Build Parts',
  'Magazines',
  'Tracers',
  'Batteries and Chargers',
  'Accessories',
  'Pistol',
  'Parts',
  'Tactical Gear',
  'Other',
] as const

const legacyCategoryNames: Record<string, string> = {
  'SQB Kits': 'SQB Build Parts',
}

// Keeps cached catalogue data and old Shop links working while the database
// migration changes persisted product rows to the final category label.
export function normalizeProductCategory(category: string) {
  return legacyCategoryNames[category] ?? category
}

export const shopCategoryDisplayOrder = productCategoryOptions

export function sortShopCategories(categories: string[]) {
  const priority = new Map<string, number>(shopCategoryDisplayOrder.map((category, index) => [category, index]))

  return [...categories].sort((first, second) => {
    const firstPriority = priority.get(first)
    const secondPriority = priority.get(second)
    if (firstPriority !== undefined || secondPriority !== undefined) {
      return (firstPriority ?? Number.MAX_SAFE_INTEGER) - (secondPriority ?? Number.MAX_SAFE_INTEGER)
    }

    return first.localeCompare(second)
  })
}
