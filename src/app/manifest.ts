import type { MetadataRoute } from 'next';

// Installed as an app it opens straight into the book, without the
// browser's bars. Colors are the light theme's page background.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'دفترچه تلفن',
    short_name: 'دفترچه',
    description: 'همه‌ی مخاطبین تو، یه‌جا و مرتب',
    lang: 'fa',
    dir: 'rtl',
    start_url: '/contacts',
    scope: '/',
    display: 'standalone',
    background_color: '#f3fafc',
    theme_color: '#f3fafc',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
