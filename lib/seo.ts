import type { Metadata } from 'next'

const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://hydro-blasters-mnl.pages.dev'
export const siteUrl = new URL(rawSiteUrl)
export const siteName = 'Hydro Blasters MNL'
export const defaultPreviewImage = '/showroom/home-hero.jpg'

type SeoOptions = {
  title: string
  description: string
  path?: string
  image?: string | null
}

export function absoluteUrl(path = '/') {
  return new URL(path, siteUrl).toString()
}

export function createPageMetadata({ title, description, path = '/', image }: SeoOptions): Metadata {
  const canonical = absoluteUrl(path)
  const previewImage = absoluteUrl(image || defaultPreviewImage)
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName,
      title,
      description,
      images: [{ url: previewImage }],
    },
  }
}

export function productDescription(product: { name: string; category: string; short_description?: string | null; description?: string | null }) {
  const detail = product.short_description?.trim() || product.description?.trim().split(/\n+/)[0] || ''
  return detail
    ? `${product.name} is a ${product.category} available from Hydro Blasters MNL. ${detail}`.slice(0, 160)
    : `Explore ${product.name}, a ${product.category}, at Hydro Blasters MNL in Pasay.`
}
