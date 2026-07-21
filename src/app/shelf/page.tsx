'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON } from '@/lib/client';
import { useI18n } from '../_components/LocaleProvider';
import { Emoji, emojify } from '../_components/Emoji';

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
      <h1>{emojify(t('shelf.diplomasTitle'))}</h1>

      {data.diplomas.length === 0 ? (
        <p className="muted">{t('shelf.diplomasEmpty')}</p>
      ) : (
        <div className="diploma-wall">
          {data.diplomas.map((d) => (
            <div key={d.code} className="diploma" title={d.label}>
              <span className="diploma-medal" aria-hidden><Emoji e="🏅" /></span>
              <span className="diploma-skill">{d.label}</span>
              <span className="diploma-tag">{t('shelf.diplomaFast')}</span>
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: '2rem' }}>
        <a className="next-btn" href="/" style={{ marginTop: 0 }}><Emoji e="🏠" /> {t('common.home')}</a>
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
