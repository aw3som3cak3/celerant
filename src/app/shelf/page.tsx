'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';
import { IconGrid } from '../_components/IconGrid';
import { useI18n } from '../_components/LocaleProvider';

type MePlayer = { id: string; icon: string };
type ShelfCard = { code: string; label: string; family: string; sample: string };
type Trophy = { code: string; label: string; family: string; prompt: string; given: string | null };
type Active = { node: ShelfCard; from: ShelfCard[]; coming: number };
type ShelfData = { days: boolean[]; trophies: Trophy[]; active: Active[]; eligible: string[] };

const show = (s: string) => (s || '').replace(/□/g, '?');

// The child's private space (the-map.md §3), simplified. Not the whole graph —
// that was too much history to use. Instead: what you're working on NOW (each skill
// as a little card, with what leads into it and a hint of what's next), and a
// TROPHY SHELF of everything you've finished.
function Shelf() {
  const { t } = useI18n();
  const p = useSearchParams().get('p') ?? '';
  const [data, setData] = useState<ShelfData | null>(null);
  const [stretch, setStretch] = useState(false);
  const [players, setPlayers] = useState<MePlayer[]>([]);
  const [pickIcon, setPickIcon] = useState(false);

  useEffect(() => {
    if (!p) return void (location.href = '/');
    getJSON<ShelfData>(`/api/shelf?playerId=${p}`).then(setData);
    getJSON<{ players?: MePlayer[] }>('/api/me').then((r) => setPlayers(r.players ?? []));
  }, [p]);

  async function toggleStretch() {
    const next = !stretch;
    setStretch(next);
    await postJSON('/api/player/stretch', { playerId: p, on: next });
  }
  async function changeIcon(icon: string) {
    const r = await postJSON<{ ok?: boolean }>('/api/player/icon', { playerId: p, icon });
    if (r.ok) location.reload();
  }
  const takenByOthers = new Set(players.filter((x) => x.id !== p).map((x) => x.icon));

  if (!data) return <div className="plain muted">…</div>;
  const eligible = new Set(data.eligible);

  return (
    <div className="plain">
      <h1>{t('map.title')}</h1>

      {/* the child's own last-7-days record — private, no sibling to compare */}
      {data.days.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0.2rem 0 1rem' }}>
          <span className="muted" style={{ fontSize: '0.8rem' }}>{t('shelf.week')}</span>
          <div className="day-row">
            {data.days.map((on, i) => (
              <span key={i} className={`day-dot ${on ? 'on' : ''} ${i === 6 ? 'today' : ''}`} />
            ))}
          </div>
        </div>
      )}

      {/* what you're working on now — one focused strip per active skill */}
      {data.active.length > 0 && (
        <section className="shelf-section">
          <h2 className="shelf-h">{t('shelf.nowPracticing')}</h2>
          <div className="focus-list">
            {data.active.map((a) => (
              <div key={a.node.code} className="focus-strip">
                {a.from.map((f) => (
                  <div key={f.code} className="node-card done" title={f.label}>
                    <span className="node-sample">{show(f.sample) || f.label}</span>
                  </div>
                ))}
                {a.from.length > 0 && <span className="focus-arrow" aria-hidden>→</span>}
                <a className="node-card active" href={`/practice?p=${p}&start=${a.node.code}`} title={a.node.label}>
                  <span className="node-sample">{show(a.node.sample) || a.node.label}</span>
                  <span className="node-label">{a.node.label}</span>
                </a>
                {a.coming > 0 && (
                  <>
                    <span className="focus-arrow" aria-hidden>→</span>
                    {Array.from({ length: Math.min(a.coming, 3) }).map((_, i) => (
                      <div key={i} className="node-card coming" aria-hidden>?</div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* trophy shelf — every completed skill, a badge for the problem you solved */}
      {data.trophies.length > 0 && (
        <section className="shelf-section">
          <h2 className="shelf-h">{t('shelf.trophies')} · {data.trophies.length}</h2>
          <div className="trophy-shelf">
            {data.trophies.map((tr) => {
              // A mastered skill the child can run a victory-lap sprint on wears a ⚡
              // and becomes tappable — their move to make, whenever they feel like it.
              const canSprint = eligible.has(tr.code);
              const body = (
                <>
                  <span className="trophy-check" aria-hidden>{canSprint ? '⚡' : '★'}</span>
                  <span className="trophy-sample">{show(tr.prompt) || tr.label}</span>
                </>
              );
              return canSprint ? (
                <a key={tr.code} className="trophy can-sprint" href={`/sprint?p=${p}&start=${encodeURIComponent(tr.code)}`} title={t('sprint.zapHint', { skill: tr.label })}>
                  {body}
                </a>
              ) : (
                <div key={tr.code} className="trophy" title={tr.label}>
                  {body}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p style={{ marginTop: '1.6rem' }}>
        <a className="primary" href={`/practice?p=${p}`}>{t('shelf.practise')}</a>
      </p>
      <p className="muted" style={{ marginTop: '0.6rem' }}>
        <button className="idk" onClick={toggleStretch}>{stretch ? t('shelf.harderOn') : t('shelf.harder')}</button>{' '}
        · <button className="idk" onClick={() => setPickIcon(true)}>{t('shelf.changeIcon')}</button>{' '}
        {/* the writing-speed game — a small, optional "how fast can you write numbers?"
            that sharpens sprint aims. Only offered once there's a skill to sprint on. */}
        {eligible.size > 0 && <>· <a className="idk" href={`/warmup?p=${p}`}>⌨️ {t('shelf.writeSpeed')}</a>{' '}</>}
        · <a className="idk" href="/">🏠 {t('common.home')}</a>
      </p>

      {pickIcon && (
        <div className="modal-backdrop" onClick={() => setPickIcon(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>{t('shelf.changeIcon')}</strong>
              <button className="idk" onClick={() => setPickIcon(false)}>{t('common.close')}</button>
            </div>
            <IconGrid allowSearch exclude={takenByOthers} onPick={changeIcon} />
          </div>
        </div>
      )}
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
