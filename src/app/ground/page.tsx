'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { postJSON } from '@/lib/client';
import { useI18n } from '../_components/LocaleProvider';
import { Emoji } from '../_components/Emoji';
import { buildGroundItem, sceneResult, sceneSymbol, GROUND_ITEMS, type GroundStage, type GroundItem } from '@/lib/ground';

// GROUND / acquisition — the shadow scene surface (GROUND-phase spec §1). A short
// climbing ladder that carries a pre-reading beginner from the MEANING of + / −
// (things arrive → more, leave → fewer) up to a pictured sum (3🦆 + 4🦆 → 7). No
// timer, no score, gentle reveal; every choice is recorded and nothing else happens.
type Phase = 'ask' | 'named';
type RunItem = { seed: number; stage: GroundStage };

function Objects({ kind, n, small, className }: { kind: string; n: number; small?: boolean; className?: string }) {
  return (
    <div className={`ground-cluster ${small ? 'small' : ''} ${className ?? ''}`}>
      {Array.from({ length: n }, (_, i) => (
        <img key={i} className={`ground-obj ${small ? 'small' : ''}`} src={`/emoji/${kind}.png`} alt="" draggable={false} />
      ))}
    </div>
  );
}

function Ground() {
  const { t } = useI18n();
  const p = useSearchParams().get('p') ?? '';
  const [items, setItems] = useState<RunItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('ask');
  const [chosenRight, setChosenRight] = useState<boolean | null>(null);

  const start = useCallback(async () => {
    setItems(null);
    setIdx(0);
    setPhase('ask');
    setChosenRight(null);
    const r = await postJSON<{ items: RunItem[] }>('/api/ground/start', { playerId: p });
    setItems(r.items);
  }, [p]);

  useEffect(() => {
    if (!p) { location.href = '/'; return; }
    start();
  }, [p, start]);

  const item: GroundItem | null = useMemo(
    () => (items ? buildGroundItem(items[idx].seed, items[idx].stage) : null),
    [items, idx],
  );

  const choose = useCallback(
    async (chosen: string | number) => {
      if (!items || phase !== 'ask' || !item) return;
      const right = item.stage === 'structure' ? chosen === item.structure : Number(chosen) === item.answer;
      setChosenRight(right);
      setPhase('named');
      const last = idx + 1 >= items.length;
      await postJSON('/api/ground/answer', { playerId: p, seed: items[idx].seed, stage: items[idx].stage, chosen, done: last });
    },
    [items, phase, item, idx, p],
  );

  const next = useCallback(() => {
    if (!items) return;
    if (idx + 1 >= items.length) { setIdx(items.length); return; } // → done
    setIdx((n) => n + 1);
    setPhase('ask');
    setChosenRight(null);
  }, [items, idx]);

  if (!items) return <div className="plain muted">…</div>;

  // Done: a warm close, no score — and a way onward, so it's never a dead end.
  if (idx >= items.length) {
    return (
      <div className="plain" style={{ textAlign: 'center' }}>
        <h1>{t('ground.doneTitle')}</h1>
        <p className="muted">{t('ground.doneLine')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1.2rem' }}>
          <button className="primary" onClick={start}><Emoji e="🌱" /> {t('ground.again')}</button>
          <a className="next-btn" href={`/practice?p=${p}`}>{t('home.startPractice')}</a>
          <a className="next-btn" href="/">{t('common.home')}</a>
        </div>
      </div>
    );
  }

  if (!item) return <div className="plain muted">…</div>;

  return (
    <div className="ground-wrap">
      <p className="muted ground-count">{idx + 1} / {GROUND_ITEMS}</p>

      {item.stage === 'structure' ? (
        <StructureScene item={item} phase={phase} chosenRight={chosenRight} onChoose={choose} onNext={next} last={idx + 1 >= items.length} />
      ) : (
        <ChoiceScene item={item} phase={phase} chosenRight={chosenRight} onChoose={choose} onNext={next} last={idx + 1 >= items.length} />
      )}
    </div>
  );
}

// ── Rung 1: structure — things arrive (more) or leave (fewer) ──────────────
function StructureScene({ item, phase, chosenRight, onChoose, onNext, last }: SceneProps<Extract<GroundItem, { stage: 'structure' }>>) {
  const { t } = useI18n();
  const result = sceneResult(item);
  return (
    <>
      <div className="ground-stage">
        {phase === 'ask' ? (
          <div className="ground-groups">
            <Objects kind={item.kind} n={item.a} />
            <Objects kind={item.kind} n={item.b} className={item.structure === 'combine' ? 'arriving' : 'leaving'} />
          </div>
        ) : (
          <div className="ground-resolved">
            <Objects kind={item.kind} n={result} className="settled" />
            <div className="ground-symbol">{sceneSymbol(item)}</div>
          </div>
        )}
      </div>
      {phase === 'ask' ? (
        <>
          <p className="ground-q">{t('ground.question')}</p>
          <div className="ground-choices">
            <button className="ground-choice more" onClick={() => onChoose('combine')}><span className="ground-choice-glyph">▲</span>{t('ground.more')}</button>
            <button className="ground-choice fewer" onClick={() => onChoose('separate')}><span className="ground-choice-glyph">▼</span>{t('ground.fewer')}</button>
          </div>
        </>
      ) : (
        <Reveal right={chosenRight} onNext={onNext} last={last} />
      )}
    </>
  );
}

// ── Rungs 2–4: pick the amount ─────────────────────────────────────────────
function ChoiceScene({ item, phase, chosenRight, onChoose, onNext, last }: SceneProps<Extract<GroundItem, { stage: 'count' | 'numeral' | 'sum' }>>) {
  const { t } = useI18n();
  const q = item.prompt.type === 'group' ? t('ground.howMany') : t('ground.howManyTogether');
  return (
    <>
      <div className="ground-stage">
        {phase === 'ask' ? (
          <div className="ground-prompt">
            {item.prompt.type === 'group' ? (
              <Objects kind={item.kind} n={item.prompt.a} />
            ) : (
              <>
                <Objects kind={item.kind} n={item.prompt.a} />
                {item.stage === 'sum' && <span className="ground-plus">+</span>}
                <Objects kind={item.kind} n={item.prompt.b} />
              </>
            )}
          </div>
        ) : (
          <div className="ground-resolved">
            <Objects kind={item.kind} n={item.answer} className="settled" />
            <div className="ground-symbol">
              {item.prompt.type === 'sum' ? `${item.prompt.a} + ${item.prompt.b} = ${item.answer}` : item.answer}
            </div>
          </div>
        )}
      </div>
      {phase === 'ask' ? (
        <>
          <p className="ground-q">{q}</p>
          <div className={`ground-options ${item.optionType}`}>
            {item.options.map((n, i) => (
              <button key={i} className="ground-option" onClick={() => onChoose(n)}>
                {item.optionType === 'numeral' ? <span className="ground-numeral">{n}</span> : <Objects kind={item.kind} n={n} small />}
              </button>
            ))}
          </div>
        </>
      ) : (
        <Reveal right={chosenRight} onNext={onNext} last={last} />
      )}
    </>
  );
}

function Reveal({ right, onNext, last }: { right: boolean | null; onNext: () => void; last: boolean }) {
  const { t } = useI18n();
  return (
    <>
      <p className={`ground-feedback ${right ? 'yes' : 'soft'}`}>{right ? t('ground.yes') : t('ground.soft')}</p>
      <button className="primary ground-next" onClick={onNext}>{last ? t('common.done') : t('ground.next')}</button>
    </>
  );
}

type SceneProps<T> = {
  item: T;
  phase: Phase;
  chosenRight: boolean | null;
  onChoose: (c: string | number) => void;
  onNext: () => void;
  last: boolean;
};

export default function Page() {
  return (
    <Suspense fallback={<div className="plain muted">…</div>}>
      <Ground />
    </Suspense>
  );
}
