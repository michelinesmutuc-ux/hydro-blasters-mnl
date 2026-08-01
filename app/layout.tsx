import type { Metadata } from 'next'
import './globals.css'
import { CartProvider } from '../components/CartProvider'

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
      <body><CartProvider>{children}</CartProvider></body>
    </html>
  )
}
