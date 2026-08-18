'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON } from '@/lib/client';
import { useI18n } from '../_components/LocaleProvider';
import { Emoji, emojify } from '../_components/Emoji';

type Diploma = { code: string; label: string; family: string };
type Korkort = {
  id: string;
  namn: string;
  tier: string;
  state: 'todo' | 'earned';
  prov: string;
  grants: string;
  kitBom: { qty: number; part: string }[];
  instructions: { kid: string[]; adult: string[] };
};
type ShelfData = { days: boolean[]; diplomas: Diploma[]; korkort?: Korkort[] };

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

  const korkort = data.korkort ?? [];
  const empty = data.diplomas.length === 0 && korkort.length === 0;

  return (
    <div className="plain" style={{ textAlign: 'center' }}>
      <h1>{emojify(t('shelf.diplomasTitle'))}</h1>

      {empty ? (
        <p className="muted">{t('shelf.diplomasEmpty')}</p>
      ) : (
        <div className="diploma-wall">
          {/* One wall, three plaque classes: earned körkort (🎖️) first — the highest achievement —
              then pending körkort (⏳), then the fluency diplomas (🏅). The progression reads. */}
          {korkort
            .filter((k) => k.state === 'earned')
            .map((k) => (
              <div key={k.id} className="diploma korkort korkort-earned" title={k.prov}>
                <span className="diploma-medal" aria-hidden><Emoji e="🪪" /></span>
                <span className="diploma-skill">Körkort: {k.namn}</span>
                <span className="diploma-tag">godkänt</span>
              </div>
            ))}

          {korkort
            .filter((k) => k.state === 'todo')
            .map((k) => (
              <div key={k.id} className="diploma korkort korkort-todo-plaque" title={k.prov}>
                <span className="diploma-medal" aria-hidden><Emoji e="⏳" /></span>
                <span className="diploma-skill">Redo: {k.namn}</span>
                <span className="diploma-tag">bygg vid stationen</span>
                <details style={{ marginTop: '0.4rem', textAlign: 'left', width: '100%' }}>
                  <summary className="muted" style={{ fontSize: '0.75rem', cursor: 'pointer' }}>byggsats + prov</summary>
                  <p style={{ fontSize: '0.72rem', margin: '0.3rem 0' }}>{k.prov}</p>
                  <ul style={{ fontSize: '0.72rem', margin: '0.3rem 0', paddingLeft: '1.1rem' }}>
                    {k.kitBom.map((l, i) => (
                      <li key={i}>{l.qty}× {l.part}</li>
                    ))}
                  </ul>
                  <ol style={{ fontSize: '0.72rem', margin: '0.3rem 0', paddingLeft: '1.1rem' }}>
                    {k.instructions.kid.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </details>
              </div>
            ))}

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
