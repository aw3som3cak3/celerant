'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';

type Card = { label: string; prompt: string; given: string | null; earnedAt: number };

function Shelf() {
  const p = useSearchParams().get('p') ?? '';
  const [cards, setCards] = useState<Card[] | null>(null);
  const [stretch, setStretch] = useState<boolean>(false);

  useEffect(() => {
    if (!p) return void (location.href = '/');
    getJSON<{ cards: Card[] }>(`/api/shelf?playerId=${p}`).then((r) => setCards(r.cards));
    getJSON<{ players?: { id: string; stretch?: boolean }[] }>('/api/me').then(() => {});
  }, [p]);

  async function toggleStretch() {
    const next = !stretch;
    setStretch(next);
    await postJSON('/api/player/stretch', { playerId: p, on: next });
  }

  if (!cards) return <div className="plain muted">…</div>;

  return (
    <div className="plain">
      <h1>Korten</h1>
      {cards.length === 0 ? (
        <p className="muted">Här samlas det första problemet du löser av varje sort. Lös ett så börjar hyllan.</p>
      ) : (
        <div className="playergrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {cards.map((c, i) => (
            <div key={i} className="namebtn" style={{ cursor: 'default', textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: '0.8rem' }}>{c.label}</div>
              <div style={{ fontVariantNumeric: 'tabular-nums', margin: '0.3rem 0' }}>{c.prompt}</div>
              <div style={{ fontVariantNumeric: 'tabular-nums' }}>{c.given ?? '—'}</div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>
                {new Date(c.earnedAt).toLocaleDateString('sv-SE')}
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: '2rem' }}>
        <button className="idk" onClick={toggleStretch}>
          {stretch ? 'svårare: på' : 'svårare'}
        </button>{' '}
        · <a className="idk" href={`/practice?p=${p}`}>träna</a> · <a className="idk" href="/">hem</a>
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="plain muted">…</div>}>
      <Shelf />
    </Suspense>
  );
}
