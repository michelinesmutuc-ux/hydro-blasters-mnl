export type FulfillmentAddress = {
  customer_name: string
  mobile_number: string
  house_unit?: string | null
  street?: string | null
  barangay?: string | null
  city_municipality?: string | null
  region?: string | null
  postal_code?: string | null
  order_notes?: string | null
}

const clean = (value: string | null | undefined) => value?.trim() || null

/** Uses only the checkout-time fields stored on the order. */
export function formatFulfillmentAddressLines(order: FulfillmentAddress) {
  const streetLine = [clean(order.house_unit), clean(order.street)].filter(Boolean).join(', ')
  const localityLine = [clean(order.barangay), clean(order.city_municipality), clean(order.region), clean(order.postal_code)].filter(Boolean).join(', ')
  return [streetLine, localityLine].filter(Boolean)
}

export function formatCourierAddress(order: FulfillmentAddress) {
  const lines = [clean(order.customer_name), clean(order.mobile_number), ...formatFulfillmentAddressLines(order)]
  const notes = clean(order.order_notes)
  if (notes) lines.push(`Delivery notes: ${notes}`)
  return lines.filter(Boolean).join('\n')
}
