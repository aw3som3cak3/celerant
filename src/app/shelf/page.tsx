'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';
import { SkillMap, type MapData } from '../_components/SkillMap';
import { useI18n } from '../_components/LocaleProvider';

// The child's private space (the-map.md §3): the card shelf laid out AS the
// skill graph. Reached cards in position, a glowing frontier, one ring of
// silhouettes, then fog. Their 7-day record and the "svårare" toggle live here
// too — no sibling can see any of it.
function Shelf() {
  const { t } = useI18n();
  const p = useSearchParams().get('p') ?? '';
  const [map, setMap] = useState<MapData | null>(null);
  const [days, setDays] = useState<boolean[]>([]);
  const [stretch, setStretch] = useState<boolean>(false);

  useEffect(() => {
    if (!p) return void (location.href = '/');
    getJSON<MapData>(`/api/map?playerId=${p}`).then(setMap);
    getJSON<{ cards: unknown[]; days: boolean[] }>(`/api/shelf?playerId=${p}`).then((r) => setDays(r.days ?? []));
  }, [p]);

  async function toggleStretch() {
    const next = !stretch;
    setStretch(next);
    await postJSON('/api/player/stretch', { playerId: p, on: next });
  }

  if (!map) return <div className="plain muted">…</div>;

  return (
    <div className="plain">
      <h1>{t('map.title')}</h1>

      {/* the child's own last-7-days record — private, no sibling to compare */}
      {days.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0.2rem 0 0.6rem' }}>
          <span className="muted" style={{ fontSize: '0.8rem' }}>{t('shelf.week')}</span>
          <div className="day-row">
            {days.map((on, i) => (
              <span key={i} className={`day-dot ${on ? 'on' : ''} ${i === 6 ? 'today' : ''}`} />
            ))}
          </div>
        </div>
      )}

      <SkillMap data={map} variant="child" playerId={p} />
      <p className="muted" style={{ fontSize: '0.8rem', marginTop: '-0.6rem' }}>{t('map.hint')}</p>

      <p style={{ marginTop: '1.4rem' }}>
        <button className="idk" onClick={toggleStretch}>
          {stretch ? t('shelf.harderOn') : t('shelf.harder')}
        </button>{' '}
        · <a className="idk" href={`/practice?p=${p}`}>{t('shelf.practise')}</a> · <a className="idk" href="/">{t('common.home')}</a>
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
