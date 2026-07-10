'use client';

import { useMemo, useState } from 'react';
import { ICONS, CATEGORIES, search, type Icon } from '@/icons';

const CAT_LABEL: Record<string, string> = {
  djur: 'djur',
  mat: 'mat',
  frukt: 'frukt',
  vaxter: 'växter',
  vader: 'väder',
  fordon: 'fordon',
  verktyg: 'verktyg',
  instrument: 'instrument',
  sport: 'sport',
};

// The child's whole interface is a grid; the search box is for a parent and is
// off by default. `exclude` hides taken icons — absent, not greyed.
export function IconGrid({
  onPick,
  selected,
  exclude,
  allowSearch = false,
}: {
  onPick: (key: string) => void;
  selected?: string[];
  exclude?: Set<string>;
  allowSearch?: boolean;
}) {
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const sel = new Set(selected ?? []);

  const shown: Icon[] = useMemo(() => {
    let list = q.trim() ? search(q) : ICONS;
    if (cat) list = list.filter((i) => i.category === cat);
    if (exclude) list = list.filter((i) => !exclude.has(i.key));
    return list;
  }, [q, cat, exclude]);

  return (
    <div>
      {allowSearch && (
        <input className="field" placeholder="sök (för förälder)" value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      <div className="cattabs">
        <button className={`cattab ${cat === null ? 'on' : ''}`} onClick={() => setCat(null)}>
          alla
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} className={`cattab ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>
            {CAT_LABEL[c] ?? c}
          </button>
        ))}
      </div>
      <div className="icongrid">
        {shown.map((i) => (
          <button
            key={i.key}
            className={`iconbtn ${sel.has(i.key) ? 'sel' : ''}`}
            title={i.name}
            aria-label={i.name}
            onClick={() => onPick(i.key)}
          >
            {i.glyph}
          </button>
        ))}
      </div>
    </div>
  );
}
