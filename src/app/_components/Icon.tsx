'use client';

import { useState } from 'react';
import { BY_KEY } from '@/icons';

// One identity icon, rendered as a bundled 3D image (Microsoft Fluent Emoji, MIT) so
// it looks identical on every device — the native emoji rendered 2D on some pads and
// 3D on others, and the kids noticed. Sized in `em`, so it scales with the
// surrounding font-size exactly as the text glyph did. Falls back to the native glyph
// if the image ever fails to load.
export function EmojiIcon({ iconKey, className, title }: { iconKey?: string | null; className?: string; title?: string }) {
  const [failed, setFailed] = useState(false);
  const icon = iconKey ? BY_KEY.get(iconKey) : undefined;
  if (!icon) return <>?</>;
  if (failed) return <>{icon.glyph}</>;
  return (
    <img
      className={`emoji-icon${className ? ` ${className}` : ''}`}
      src={`/emoji/${iconKey}.png`}
      alt={icon.glyph}
      title={title ?? icon.name}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
