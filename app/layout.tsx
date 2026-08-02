import type { Metadata } from 'next'
import './globals.css'
import { CartProvider } from '../components/CartProvider'
import { ComparisonProvider } from '../components/ComparisonProvider'
import { createPageMetadata, siteName, siteUrl } from '../lib/seo'

export const metadata: Metadata = {
  ...createPageMetadata({
    title: 'Hydro Blasters MNL | Pasay',
    description: 'Hydro Blasters MNL is a Philippine gel blaster retailer based in Pasay offering beginner-friendly and hobby-grade gel blasters, nationwide shipping, and a showroom available by appointment.',
  }),
  applicationName: 'Hydro Blasters MNL',
  metadataBase: siteUrl,
  title: { default: 'Hydro Blasters MNL | Pasay', template: `%s | ${siteName}` },
  icons: {
    icon: '/icon.png',
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><CartProvider><ComparisonProvider>{children}</ComparisonProvider></CartProvider></body>
    </html>
  )
}
