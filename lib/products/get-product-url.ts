export function getProductUrl(product: { slug: string }) {
  return `/products/${product.slug}`
}
