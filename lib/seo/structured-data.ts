import { absoluteUrl, siteName } from '../seo'

type BreadcrumbItem = { name: string; path: string }

export function organizationStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteName,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/hydro-blasters-mnl-logo.png'),
    foundingDate: '2021-03',
    description: 'Hydro Blasters MNL is an online retailer and appointment-based showroom established in March 2021 and located in Pasay City, Philippines.',
    sameAs: ['https://share.google/PpkRkOnaYAk5PHIrg'],
  }
}

export function localBusinessStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: siteName,
    url: absoluteUrl('/visit-showroom'),
    image: absoluteUrl('/showroom/entrance.JPG'),
    logo: absoluteUrl('/hydro-blasters-mnl-logo.png'),
    foundingDate: '2021-03',
    description: 'Hydro Blasters MNL is an appointment-based showroom in Pasay City, Philippines. Showroom visits require a confirmed appointment.',
    address: { '@type': 'PostalAddress', addressLocality: 'Pasay City', addressRegion: 'Metro Manila', addressCountry: 'PH' },
    hasMap: 'https://share.google/PpkRkOnaYAk5PHIrg',
    sameAs: ['https://share.google/PpkRkOnaYAk5PHIrg'],
    potentialAction: { '@type': 'ReserveAction', name: 'Request a showroom appointment', target: absoluteUrl('/appointments') },
  }
}

export function breadcrumbStructuredData(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: absoluteUrl(item.path) })),
  }
}
