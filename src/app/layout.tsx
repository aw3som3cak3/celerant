import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LocaleProvider } from './_components/LocaleProvider';

export const metadata: Metadata = {
  title: 'Practice',
  description: 'Arithmetic and algebra practice.',
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
