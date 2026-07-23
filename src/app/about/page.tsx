// Public "what is this" page — reachable logged-out, linked from the login card.
// The shell is a server component (metadata, instant render); the content is a
// client component that follows the locale toggle. Swedish and English are both
// carried; Swedish is a transcreation, not a translation, and shows by default.
import type { Metadata } from 'next';
import { AboutContent } from './AboutContent';

export const metadata: Metadata = {
  title: 'Celerant — vad det är',
  description:
    'En liten, gratis, reklamfri mattetränare för barn. Flyt framför rätt svar; att bevittna framför att belöna; barnets egen historik framför all jämförelse. / A small, free, ad-free maths trainer for children.',
};

export default function About() {
  return <AboutContent />;
}
