import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hydro Blasters MNL — Play in Full Color',
  description: 'Premium toy gel blasters and elevated essentials in the Philippines.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
