import type { Metadata } from 'next'
import './globals.css'
import { CartProvider } from '../components/CartProvider'
import { ComparisonProvider } from '../components/ComparisonProvider'

export const metadata: Metadata = {
  title: 'Hydro Blasters MNL | Gel Blasters & Accessories',
  description:
    'Shop gel blasters, accessories, and magazines at Hydro Blasters MNL. Compare products, learn through our Help Center, and book a visit to our appointment-based showroom in Pasay City.',
  applicationName: 'Hydro Blasters MNL',
  icons: {
    icon: '/icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Hydro Blasters MNL',
    title: 'Hydro Blasters MNL | Gel Blasters & Accessories',
    description:
      'Shop gel blasters, accessories, and magazines at Hydro Blasters MNL. Compare products, learn through our Help Center, and book a visit to our appointment-based showroom in Pasay City.',
  },
  twitter: {
    card: 'summary',
    title: 'Hydro Blasters MNL | Gel Blasters & Accessories',
    description:
      'Shop gel blasters, accessories, and magazines at Hydro Blasters MNL. Compare products, learn through our Help Center, and book a visit to our appointment-based showroom in Pasay City.',
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><CartProvider><ComparisonProvider>{children}</ComparisonProvider></CartProvider></body>
    </html>
  )
}
