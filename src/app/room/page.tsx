'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';
import { CATS, ROSTER_BY_ID, type Target } from '@/reward/roster';
import { useI18n } from '../_components/LocaleProvider';

type RewardData = { progress: Record<string, number>; unlockedCats: string[]; sharedTarget: Target };

// ── The single art swap-point (celerant-cat-collection-spec.md §Asset task) ──
// Today every cat is a placeholder: one emoji, hue-shifted per sprite id so the
// ten read as distinct. Replace THIS function with the ToffeeCraft sprite lookup
// (a <div> with a background sprite-sheet + step animation) and nothing else in
// the room changes — position, wander, z-sort and petting all stay.
function spriteHue(spriteId: string): number {
  let h = 0;
  for (const c of spriteId) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
function CatSprite({ spriteId, walking }: { spriteId: string; walking: boolean }) {
  return (
    <span
      className={`cat-sprite ${walking ? 'walking' : ''}`}
      style={{ filter: `hue-rotate(${spriteHue(spriteId)}deg) saturate(1.4)` }}
      aria-hidden
    >
      🐱
    </span>
  );
}

type Wanderer = { id: string; x: number; y: number; walking: boolean };

function Room() {
  const { t, locale } = useI18n();
  const sp = useSearchParams();
  const p = sp.get('p') ?? '';
  const [data, setData] = useState<RewardData | null>(null);
  const [wanderers, setWanderers] = useState<Wanderer[]>([]);
  const [petting, setPetting] = useState<string | null>(null);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const heartId = useRef(0);

  const load = useCallback(() => getJSON<RewardData>('/api/reward').then(setData), []);
  useEffect(() => {
    load();
  }, [load]);

  // Spawn one wanderer per unlocked cat, at a stable-ish start position.
  useEffect(() => {
    if (!data) return;
    setWanderers((prev) => {
      const byId = new Map(prev.map((w) => [w.id, w]));
      return data.unlockedCats.map((id, i) => byId.get(id) ?? { id, x: 12 + ((i * 27) % 76), y: 30 + ((i * 37) % 55), walking: false });
    });
  }, [data]);

  // The wander loop: every couple of seconds each cat either strolls to a new
  // spot or settles. No needs, no timers on the cat's mood — just gentle life.
  useEffect(() => {
    if (wanderers.length === 0) return;
    const iv = setInterval(() => {
      setWanderers((ws) =>
        ws.map((w) => {
          if (Math.random() < 0.55) return { ...w, walking: true, x: Math.max(6, Math.min(90, w.x + (Math.random() * 44 - 22))), y: Math.max(28, Math.min(86, w.y + (Math.random() * 30 - 15))) };
          return { ...w, walking: false };
        }),
      );
    }, 2600);
    return () => clearInterval(iv);
  }, [wanderers.length]);

  function pet(id: string, e: React.MouseEvent) {
    setPetting(id);
    const hx = e.nativeEvent.offsetX;
    const hy = e.nativeEvent.offsetY;
    const hid = heartId.current++;
    setHearts((hs) => [...hs, { id: hid, x: hx, y: hy }]);
    setTimeout(() => setHearts((hs) => hs.filter((h) => h.id !== hid)), 900);
  }

  async function setSharedTarget(target: Target) {
    const r = await postJSON<{ reward?: RewardData }>('/api/reward/shared-target', { target });
    if (r.reward) setData(r.reward);
  }

  if (!data) return <div className="room-wrap"><p className="room-loading">…</p></div>;

  const shared = data.sharedTarget;
  const sharedCat = shared.kind === 'cat' ? ROSTER_BY_ID.get(shared.id) : undefined;
  const sharedUnlocked = sharedCat ? data.unlockedCats.includes(sharedCat.id) : false;

  return (
    <div className="room-wrap">
      {/* The pixel room — a separate visual register from the practice UI. */}
      <div className="room-stage">
        {hearts.map((h) => (
          <span key={h.id} className="room-heart" style={{ left: h.x, top: h.y }}>❤</span>
        ))}
        {[...wanderers].sort((a, b) => a.y - b.y).map((w) => {
          const cat = ROSTER_BY_ID.get(w.id)!;
          return (
            <button
              key={w.id}
              className="cat-actor"
              style={{ left: `${w.x}%`, top: `${w.y}%`, zIndex: Math.round(w.y) }}
              onClick={(e) => pet(w.id, e)}
              title={cat.name[locale]}
            >
              <CatSprite spriteId={cat.spriteId} walking={w.walking} />
            </button>
          );
        })}

        {/* Approach cue: the shared cat still in its carrier, with a climbing meter
            from session one, so the room is a visible climb, not an empty floor. */}
        {sharedCat && !sharedUnlocked && (
          <div className="cat-carrier">
            <div className="carrier-box">📦</div>
            <div className="carrier-label">{sharedCat.name[locale]}</div>
            <div className="carrier-meter"><span style={{ width: `${Math.min(100, ((data.progress[sharedCat.id] ?? 0) / sharedCat.cost) * 100)}%` }} /></div>
            <div className="carrier-count">{data.progress[sharedCat.id] ?? 0} / {sharedCat.cost}</div>
          </div>
        )}

        {data.unlockedCats.length === 0 && !sharedCat && <p className="room-empty">{t('room.empty')}</p>}
      </div>

      {/* Petting card: name + one-line who/what. Meter-free delight. */}
      {petting && (
        <div className="pet-card" onClick={() => setPetting(null)}>
          <strong>{ROSTER_BY_ID.get(petting)!.name[locale]}</strong>
          <span>{ROSTER_BY_ID.get(petting)!.blurb[locale]}</span>
          <button className="idk" onClick={() => setPetting(null)}>{t('common.close')}</button>
        </div>
      )}

      {/* Target board: the roster + the family goal, each with progress toward its
          cost, and a "collect this next" action for the shared default. */}
      <div className="target-board">
        <h2>{t('room.board')}</h2>
        {CATS.map((cat) => {
          const n = data.progress[cat.id] ?? 0;
          const done = data.unlockedCats.includes(cat.id);
          const isShared = shared.kind === 'cat' && shared.id === cat.id;
          return (
            <div key={cat.id} className={`target-row ${done ? 'done' : ''}`}>
              <span className="target-face" style={{ filter: `hue-rotate(${spriteHue(cat.spriteId)}deg) saturate(1.4)` }}>🐱</span>
              <span className="target-name">{cat.name[locale]}</span>
              <span className="target-meter"><span style={{ width: `${Math.min(100, (n / cat.cost) * 100)}%` }} /></span>
              <span className="target-count">{done ? '✓' : `${n}/${cat.cost}`}</span>
              {!done && !isShared && <button className="idk" onClick={() => setSharedTarget({ kind: 'cat', id: cat.id })}>{t('room.collectThis')}</button>}
              {isShared && <span className="target-current">{t('room.collecting')}</span>}
            </div>
          );
        })}
        <div className={`target-row ${shared.kind === 'family' ? '' : ''}`}>
          <span className="target-face">🎯</span>
          <span className="target-name">{t('room.familyGoal')}</span>
          <span className="target-count">{data.progress['family'] ?? 0}</span>
          {shared.kind !== 'family' ? (
            <button className="idk" onClick={() => setSharedTarget({ kind: 'family', id: 'family' })}>{t('room.collectThis')}</button>
          ) : (
            <span className="target-current">{t('room.collecting')}</span>
          )}
        </div>
      </div>

      <p className="room-nav">
        {p && <a className="idk" href={`/practice?p=${p}`}>{t('shelf.practise')}</a>}
        {' · '}
        <a className="idk" href="/">{t('common.home')}</a>
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="room-wrap"><p className="room-loading">…</p></div>}>
      <Room />
    </Suspense>
  );
}
