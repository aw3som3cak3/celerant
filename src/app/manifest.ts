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
    background_color: '#ffffff',
    theme_color: '#ffffff',
  };
}
