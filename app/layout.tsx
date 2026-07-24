import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hydro Blasters MNL — Play in Full Color',
  description: 'Storefront details coming soon.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
