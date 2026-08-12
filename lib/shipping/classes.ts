export const shippingClasses = {
  Compact: { units: 1, fee: 99, label: 'Compact' },
  Standard: { units: 3, fee: 149, label: 'Standard' },
  Bulky: { units: 9, fee: 249, label: 'Bulky' },
} as const

export type ShippingClass = keyof typeof shippingClasses
export const shippingClassOptions = (Object.keys(shippingClasses) as ShippingClass[]).map((shippingClass) => ({
  value: shippingClass,
  label: `${shippingClass} — ₱${shippingClasses[shippingClass].fee} tier`,
}))

export function normalizeShippingClass(value: unknown): ShippingClass {
  return value === 'Compact' || value === 'Standard' || value === 'Bulky' ? value : 'Bulky'
}

export function calculateShipping(lines: { shipping_class?: unknown; quantity: number }[]) {
  const units = lines.reduce((total, line) => total + shippingClasses[normalizeShippingClass(line.shipping_class)].units * Math.max(0, line.quantity), 0)
  const shippingClass: ShippingClass = units <= 2 ? 'Compact' : units <= 8 ? 'Standard' : 'Bulky'
  return { shippingClass, fee: units === 0 ? 0 : shippingClasses[shippingClass].fee }
}
