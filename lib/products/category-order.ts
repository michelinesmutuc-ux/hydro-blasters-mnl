// Keep the Shop landing shelves in a merchant-friendly order. Categories not
// listed here still appear after these in their existing product order.
export const productCategoryOptions = [
  'Gel Blaster',
  'SQB Kits',
  'Magazines',
  'Tracers',
  'Batteries and Chargers',
  'Accessories',
  'Pistol',
  'Parts',
  'Tactical Gear',
  'Other',
] as const

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
