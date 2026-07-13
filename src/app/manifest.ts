import type { MetadataRoute } from 'next';

// PWA manifest (add-map-icon-title §3): if the app is added to a home screen, the
// name shown must be "Celerant", never the "practice" route name. Next.js serves
// this at /manifest.webmanifest and links it from <head> automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Celerant',
    short_name: 'Celerant',
    description: 'Arithmetic and algebra practice.',
    start_url: '/',
    display: 'standalone',
    background_color: '#283848', // the logo's navy, so the splash matches the icon
    theme_color: '#283848',
    // The "C" logo. Full-bleed navy with a centred mark, so it doubles as a
    // maskable icon (Chrome "install / create shortcut" gets a proper app icon).
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
