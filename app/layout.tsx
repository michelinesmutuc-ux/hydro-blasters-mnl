import type { Metadata } from 'next'
import './globals.css'
import { CartProvider } from '../components/CartProvider'
import { ComparisonProvider } from '../components/ComparisonProvider'

export const metadata: Metadata = {
  title: 'Hydro Blasters MNL — Play in Full Color',
  description: 'Storefront details coming soon.',
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
