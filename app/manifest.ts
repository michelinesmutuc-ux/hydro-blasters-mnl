import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return { name: 'Hydro Blasters MNL', short_name: 'Hydro Blasters', start_url: '/', display: 'standalone', background_color: '#050506', theme_color: '#050506', icons: [{ src: '/icon.png', sizes: 'any', type: 'image/png' }] }
}
