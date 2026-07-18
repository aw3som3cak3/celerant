'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON } from '@/lib/client';
import { useI18n } from '../_components/LocaleProvider';

type Diploma = { code: string; label: string; family: string };
type ShelfData = { days: boolean[]; diplomas: Diploma[] };

// The trophy room, remade for kids: a wall of DIPLOMAS — one plaque per skill they
// made fast in a speed run. Only earned fluency, nothing else, nothing to compare.
function Shelf() {
  const { t } = useI18n();
  const p = useSearchParams().get('p') ?? '';
  const [data, setData] = useState<ShelfData | null>(null);

  useEffect(() => {
    if (!p) return void (location.href = '/');
    getJSON<ShelfData>(`/api/shelf?playerId=${p}`).then(setData);
  }, [p]);

  if (!data) return <div className="plain muted">…</div>;

  return (
    <div className="plain" style={{ textAlign: 'center' }}>
      <h1>{t('shelf.diplomasTitle')}</h1>

      {/* the child's own last-7-days record — private, no sibling to compare */}
      {data.days.length > 0 && (
        <div className="day-row" style={{ justifyContent: 'center', margin: '0.2rem auto 1.4rem' }}>
          {data.days.map((on, i) => (
            <span key={i} className={`day-dot ${on ? 'on' : ''} ${i === 6 ? 'today' : ''}`} />
          ))}
        </div>
      )}

      {data.diplomas.length === 0 ? (
        <p className="muted">{t('shelf.diplomasEmpty')}</p>
      ) : (
        <div className="diploma-wall">
          {data.diplomas.map((d) => (
            <div key={d.code} className="diploma" title={d.label}>
              <span className="diploma-medal" aria-hidden>🏅</span>
              <span className="diploma-skill">{d.label}</span>
              <span className="diploma-tag">{t('shelf.diplomaFast')}</span>
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: '1.8rem' }}>
        <a className="primary" href={`/practice?p=${p}`}>{t('shelf.practise')}</a>{' '}
        <a className="idk" href="/">🏠 {t('common.home')}</a>
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
