export const shippingClasses = {
  Compact: { units: 1, fee: 99, label: 'Compact' },
  Medium: { units: 3, fee: 179, label: 'Medium' },
  Bulky: { units: 9, fee: 249, label: 'Bulky' },
} as const

export type ShippingClass = keyof typeof shippingClasses
export const shippingClassOptions = (Object.keys(shippingClasses) as ShippingClass[]).map((shippingClass) => ({
  value: shippingClass,
  label: `${shippingClass} — ₱${shippingClasses[shippingClass].fee} tier`,
}))

export function normalizeShippingClass(value: unknown): ShippingClass {
  // Standard is retained only as a safe read-time alias until the database
  // migration converts old products to Medium.
  if (value === 'Standard') return 'Medium'
  return value === 'Compact' || value === 'Medium' || value === 'Bulky' ? value : 'Bulky'
}

export function calculateShipping(lines: { shipping_class?: unknown; quantity: number }[]) {
  const units = lines.reduce((total, line) => total + shippingClasses[normalizeShippingClass(line.shipping_class)].units * Math.max(0, line.quantity), 0)
  const shippingClass: ShippingClass = units <= 2 ? 'Compact' : units <= 8 ? 'Medium' : 'Bulky'
  return { shippingClass, fee: units === 0 ? 0 : shippingClasses[shippingClass].fee }
}
