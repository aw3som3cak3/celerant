'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';
import { useI18n } from '../_components/LocaleProvider';

type Card = { label: string; prompt: string; given: string | null; earnedAt: number };

function Shelf() {
  const { t } = useI18n();
  const p = useSearchParams().get('p') ?? '';
  const [cards, setCards] = useState<Card[] | null>(null);
  const [days, setDays] = useState<boolean[]>([]);
  const [stretch, setStretch] = useState<boolean>(false);

  useEffect(() => {
    if (!p) return void (location.href = '/');
    getJSON<{ cards: Card[]; days: boolean[] }>(`/api/shelf?playerId=${p}`).then((r) => {
      setCards(r.cards);
      setDays(r.days ?? []);
    });
  }, [p]);

  async function toggleStretch() {
    const next = !stretch;
    setStretch(next);
    await postJSON('/api/player/stretch', { playerId: p, on: next });
  }

  if (!cards) return <div className="plain muted">…</div>;

  return (
    <div className="plain">
      <h1>{t('shelf.title')}</h1>

      {/* the child's own last-7-days record — private, no sibling to compare */}
      {days.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0.2rem 0 1.4rem' }}>
          <span className="muted" style={{ fontSize: '0.8rem' }}>{t('shelf.week')}</span>
          <div className="day-row">
            {days.map((on, i) => (
              <span key={i} className={`day-dot ${on ? 'on' : ''} ${i === 6 ? 'today' : ''}`} />
            ))}
          </div>
        </div>
      )}

      {cards.length === 0 ? (
        <p className="muted">{t('shelf.empty')}</p>
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
