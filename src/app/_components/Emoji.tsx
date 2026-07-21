'use client';

import { Fragment, useState, type ReactNode } from 'react';

// Decorative (non-identity) emoji, rendered as a bundled 3D image (Microsoft Fluent
// Emoji, MIT) for the same reason the identity icons are — native emoji render 2D on
// some pads and 3D on others, and the kids noticed the mismatch. Sized in `em` so it
// tracks the surrounding font-size, exactly like the text glyph it replaces. Falls
// back to the native glyph if the image ever fails to load.
//
// Keyed by the base codepoint (variation selector U+FE0F stripped), so '✏️' and '✏'
// map to the same asset. A glyph with no mapping renders as its native self.
const BASENAME: Record<string, string> = {
  '⚡': 'lightning',
  '🎉': 'party_popper',
  '🏅': 'sports_medal',
  '🏠': 'house',
  '🎯': 'direct_hit',
  '✏': 'pencil',
  '⌨': 'keyboard',
  '🐱': 'cat',
  '⚠': 'warning',
  '🚀': 'rocket',
  '🗺': 'world_map',
  '❤': 'red_heart',
  '📦': 'package',
};

// U+FE0F (emoji variation selector) and U+FE0E (text) don't change identity here.
const stripVS = (g: string) => g.replace(/[︎️]/g, '');

function Img({ glyph }: { glyph: string }) {
  const [failed, setFailed] = useState(false);
  const base = BASENAME[stripVS(glyph)];
  if (!base || failed) return <>{glyph}</>;
  return (
    <img
      className="emoji-icon"
      src={`/emoji/${base}.png`}
      alt={glyph}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

// Single decorative emoji in JSX: <Emoji e="🎯" />.
export function Emoji({ e }: { e: string }) {
  return <Img glyph={e} />;
}

// Render a translated string, swapping any decorative glyphs for their 3D image while
// leaving the surrounding text untouched. Lets the i18n strings keep the emoji in
// context (so translators see it) — 'Allt rätt! 🎉 Kör snabbare' renders with the
// popper mid-sentence, no restructuring.
const GLYPH_RE = /(\p{Extended_Pictographic}️?)/gu;
export function emojify(text: string): ReactNode {
  const parts = text.split(GLYPH_RE);
  return parts.map((part, i) =>
    BASENAME[stripVS(part)] ? <Img key={i} glyph={part} /> : <Fragment key={i}>{part}</Fragment>,
  );
}
