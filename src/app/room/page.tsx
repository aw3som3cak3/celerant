'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';
import { CATS, PROPS, ROSTER_BY_ID, type Target } from '@/reward/roster';
import { useI18n } from '../_components/LocaleProvider';
import { Emoji } from '../_components/Emoji';

type RewardData = { progress: Record<string, number>; unlockedCats: string[]; unlockedProps: string[]; sharedTarget: Target; familyGoalOpen: boolean; familyGoalLabel: string | null };

// The cat, from the ToffeeCraft sprite sheets (src/reward/sprites.ts). A 32×32
// frame window over /cats/<spriteId>/<anim>.png, stepped by CSS; scaled up with
// nearest-neighbour so it stays crisp pixel art. Facing flips with travel.
function CatSprite({ spriteId, walking, flip }: { spriteId: string; walking: boolean; flip: boolean }) {
  const anim = walking ? 'walk' : 'idle';
  return (
    <span
      className={`cat-sprite ${walking ? 'walk' : ''}`}
      style={{ backgroundImage: `url(/cats/${spriteId}/${anim}.png)`, transform: `scale(2.6) scaleX(${flip ? -1 : 1})` }}
      aria-hidden
    />
  );
}

// A still cat (first idle frame) for the board, the pet card and chips.
function CatFace({ spriteId, size = 30 }: { spriteId: string; size?: number }) {
  return (
    <span
      className="cat-face"
      style={{ width: size, height: size, backgroundImage: `url(/cats/${spriteId}/idle.png)`, backgroundSize: `${size * 7}px ${size}px` }}
      aria-hidden
    />
  );
}

type Wanderer = { id: string; x: number; y: number; walking: boolean; flip: boolean };

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
      // y stays in the bottom ~40% of the stage — the cats live ON the floor, never
      // floating up into the sky/wall area of the background.
      return data.unlockedCats.map((id, i) => byId.get(id) ?? { id, x: 12 + ((i * 27) % 76), y: 64 + ((i * 17) % 24), walking: false, flip: false });
    });
  }, [data]);

  // The wander loop: every couple of seconds each cat either strolls to a new
  // spot or settles. No needs, no timers on the cat's mood — just gentle life.
  useEffect(() => {
    if (wanderers.length === 0) return;
    const iv = setInterval(() => {
      setWanderers((ws) =>
        ws.map((w) => {
          if (Math.random() < 0.55) {
            const nx = Math.max(6, Math.min(90, w.x + (Math.random() * 44 - 22)));
            // clamp to the floor band (bottom ~40%): never above 62% from the top
            const ny = Math.max(62, Math.min(90, w.y + (Math.random() * 22 - 11)));
            return { ...w, walking: true, x: nx, y: ny, flip: nx < w.x };
          }
          return { ...w, walking: false };
        }),
      );
    }, 2600);
    return () => clearInterval(iv);
  }, [wanderers.length]);

  function pet(w: Wanderer) {
    setPetting(w.id);
    const hid = heartId.current++;
    // The heart rises from the CAT's own position (percent coords in the stage).
    // The old code used the click's offsetX/Y — measured inside the little sprite
    // box, a handful of px — which placed the heart up near the ceiling instead of
    // over the cat.
    const x = Math.max(2, Math.min(98, w.x + (Math.random() * 6 - 3)));
    const y = Math.max(2, w.y - 8); // a touch above the cat
    setHearts((hs) => [...hs, { id: hid, x, y }]);
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
        {/* Furniture: unlocked props sit at their fixed floor spots, behind the cats
            (rendered first, so a wandering cat paints in front of them). */}
        {data.unlockedProps.map((id) => {
          const it = ROSTER_BY_ID.get(id);
          if (!it?.slot) return null;
          return (
            <img
              key={id}
              className="room-prop"
              src={`/props/${id}.png`}
              alt=""
              title={it.name[locale]}
              draggable={false}
              style={{ left: `${it.slot.x}%`, top: `${it.slot.y}%`, height: it.size ?? 40 }}
            />
          );
        })}
        {hearts.map((h) => (
          <span key={h.id} className="room-heart" style={{ left: `${h.x}%`, top: `${h.y}%` }}><Emoji e="❤" /></span>
        ))}
        {[...wanderers].sort((a, b) => a.y - b.y).map((w) => {
          const cat = ROSTER_BY_ID.get(w.id)!;
          return (
            <button
              key={w.id}
              className="cat-actor"
              style={{ left: `${w.x}%`, top: `${w.y}%`, zIndex: Math.round(w.y) }}
              onClick={() => pet(w)}
              title={cat.name[locale]}
            >
              {shared.kind === 'cat' && shared.id === w.id && <span className="cat-pill">{t('room.selected')}</span>}
              <CatSprite spriteId={cat.spriteId} walking={w.walking} flip={w.flip} />
            </button>
          );
        })}

        {data.unlockedCats.length === 0 && !sharedCat && <p className="room-empty">{t('room.empty')}</p>}
      </div>

      {/* Approach cue: the shared cat still in its carrier, with a climbing meter from
          session one, so collecting reads as a visible climb. It lives UNDER the room,
          not over it — inside the stage it covered the cats and swallowed the taps
          meant for petting them. */}
      {sharedCat && !sharedUnlocked && (
        <div className="cat-carrier">
          <div className="carrier-box"><Emoji e="📦" /></div>
          <div className="carrier-info">
            <div className="carrier-label">{sharedCat.name[locale]} <span className="cat-pill">{t('room.selected')}</span></div>
            <div className="carrier-meter"><span style={{ width: `${Math.min(100, ((data.progress[sharedCat.id] ?? 0) / sharedCat.cost) * 100)}%` }} /></div>
            <div className="carrier-count">{data.progress[sharedCat.id] ?? 0} / {sharedCat.cost}</div>
          </div>
        </div>
      )}

      {/* Petting card: name + one-line who/what. Meter-free delight. */}
      {petting && (
        <div className="pet-card" onClick={() => setPetting(null)}>
          <CatFace spriteId={ROSTER_BY_ID.get(petting)!.spriteId} size={48} />
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
              <CatFace spriteId={cat.spriteId} size={30} />
              <span className="target-name">{cat.name[locale]}</span>
              <span className="target-meter"><span style={{ width: `${Math.min(100, (n / cat.cost) * 100)}%` }} /></span>
              <span className="target-count">{done ? '✓' : `${n}/${cat.cost}`}</span>
              {!done && !isShared && <button className="idk" onClick={() => setSharedTarget({ kind: 'cat', id: cat.id })}>{t('room.collectThis')}</button>}
              {isShared && <span className="pill-selected">{t('room.selected')}</span>}
            </div>
          );
        })}
        {/* the family goal is only a collectable target while it exists and is
            unreached; a reached goal is celebrated elsewhere (the goal chip) */}
        {data.familyGoalOpen && (
          <div className="target-row">
            <span className="target-face"><Emoji e="🎯" /></span>
            <span className="target-name">{data.familyGoalLabel ?? t('room.familyGoal')}</span>
            <span className="target-count">{data.progress['family'] ?? 0}</span>
            {shared.kind !== 'family' ? (
              <button className="idk" onClick={() => setSharedTarget({ kind: 'family', id: 'family' })}>{t('room.collectThis')}</button>
            ) : (
              <span className="pill-selected">{t('room.selected')}</span>
            )}
          </div>
        )}

        {/* Furniture — the same directed-session collection as cats, placed in the
            room once earned. */}
        <h2 className="target-subhead">{t('room.furniture')}</h2>
        {PROPS.map((pr) => {
          const n = data.progress[pr.id] ?? 0;
          const done = data.unlockedProps.includes(pr.id);
          const isShared = shared.kind === 'prop' && shared.id === pr.id;
          return (
            <div key={pr.id} className={`target-row ${done ? 'done' : ''}`}>
              <span className="prop-thumb" style={{ backgroundImage: `url(/props/${pr.id}.png)` }} aria-hidden />
              <span className="target-name">{pr.name[locale]}</span>
              <span className="target-meter"><span style={{ width: `${Math.min(100, (n / pr.cost) * 100)}%` }} /></span>
              <span className="target-count">{done ? '✓' : `${n}/${pr.cost}`}</span>
              {!done && !isShared && <button className="idk" onClick={() => setSharedTarget({ kind: 'prop', id: pr.id })}>{t('room.collectThis')}</button>}
              {isShared && <span className="pill-selected">{t('room.selected')}</span>}
            </div>
          );
        })}
      </div>

      <div className="room-nav">
        {p && <a className="room-btn" href={`/practice?p=${p}`}>{t('shelf.practise')}</a>}
        <a className="room-btn" href="/"><Emoji e="🏠" /> {t('common.home')}</a>
      </div>
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
