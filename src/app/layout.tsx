import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LocaleProvider } from './_components/LocaleProvider';

// The app name, not the route name — a child-facing tab must never read
// "Practice" (add-map-icon-title §3). One app-wide title; no per-screen override
// leaks a route name into the tab. `title` is a plain string, so every screen
// (child, create/login, parent) shows exactly "Celerant".
export const metadata: Metadata = {
  title: 'Celerant',
  description: 'Arithmetic and algebra practice.',
  applicationName: 'Celerant',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
