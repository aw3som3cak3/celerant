'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { postJSON } from '@/lib/client';
import { useI18n } from '../_components/LocaleProvider';
import { Emoji } from '../_components/Emoji';
import { buildGroundItem, sceneResult, sceneSymbol, type GroundStage, type GroundItem } from '@/lib/ground';

// GROUND / acquisition — the scene surface (GROUND-phase spec §1). Two modes:
//   ladder  climbs the acquisition rungs (meaning → count → numeral → sum), with a
//           gentle reveal after each choice. Timed only to gather data.
//   speed   a fluency round on the rungs the child is ALREADY accurate at: fast,
//           auto-advancing, no reveal — his own speed run, ending in a rate.
type Phase = 'ask' | 'named';
type RunItem = { seed: number; stage: GroundStage };
type SpeedResult = { seed: number; stage: GroundStage; chosen: string | number; intervalMs: number };
type SpeedOutcome = { correct: number; total: number; correctPerMin: number; aim: number; outcome: 'fast' | 'keep_going' };

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
  const sp = useSearchParams();
  const p = sp.get('p') ?? '';
  const urlMode: 'ladder' | 'speed' = sp.get('mode') === 'speed' ? 'speed' : 'ladder';

  const [mode, setMode] = useState<'ladder' | 'speed'>(urlMode);
  const [items, setItems] = useState<RunItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('ask');
  const [chosenRight, setChosenRight] = useState<boolean | null>(null);
  const [speedReady, setSpeedReady] = useState(false);
  const [speedOutcome, setSpeedOutcome] = useState<SpeedOutcome | null>(null);

  const startRef = useRef(0); // client clock, set once the item has painted
  const capturedRef = useRef(false); // one answer per item (guards a double-tap)
  const speedResultsRef = useRef<SpeedResult[]>([]);

  const start = useCallback(
    async (m: 'ladder' | 'speed') => {
      setMode(m);
      setItems(null);
      setIdx(0);
      setPhase('ask');
      setChosenRight(null);
      setSpeedOutcome(null);
      speedResultsRef.current = [];
      capturedRef.current = false;
      const r = await postJSON<{ items: RunItem[]; speedReady: boolean }>('/api/ground/start', { playerId: p, mode: m }).catch(() => null);
      if (!r) { if (m === 'speed') start('ladder'); return; } // e.g. nothing grounded yet → fall back
      setItems(r.items);
      setSpeedReady(r.speedReady);
    },
    [p],
  );

  useEffect(() => {
    if (!p) { location.href = '/'; return; }
    start(urlMode);
  }, [p, urlMode, start]);

  // Start the per-item clock once the item has actually painted (two rAFs).
  useEffect(() => {
    capturedRef.current = false;
    if (!items || idx >= items.length) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => { startRef.current = performance.now(); }); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [items, idx]);

  const item: GroundItem | null = useMemo(
    () => (items && idx < items.length ? buildGroundItem(items[idx].seed, items[idx].stage) : null),
    [items, idx],
  );

  const finishSpeed = useCallback(
    async (results: SpeedResult[]) => {
      const r = await postJSON<SpeedOutcome>('/api/ground/finish', { playerId: p, results });
      setSpeedOutcome(r);
    },
    [p],
  );

  const choose = useCallback(
    async (chosen: string | number) => {
      if (!items || !item || capturedRef.current) return;
      capturedRef.current = true;
      const intervalMs = Math.max(0, Math.round(performance.now() - startRef.current));
      const cur = items[idx];

      if (mode === 'speed') {
        // No reveal — record the timing and fly to the next item; finish → rate.
        speedResultsRef.current = [...speedResultsRef.current, { seed: cur.seed, stage: cur.stage, chosen, intervalMs }];
        if (idx + 1 >= items.length) finishSpeed(speedResultsRef.current);
        else setIdx((n) => n + 1);
        return;
      }

      // Ladder: grade locally for the reveal, record server-side.
      const right = item.stage === 'structure' ? chosen === item.structure : Number(chosen) === item.answer;
      setChosenRight(right);
      setPhase('named');
      const last = idx + 1 >= items.length;
      await postJSON('/api/ground/answer', { playerId: p, seed: cur.seed, stage: cur.stage, chosen, intervalMs, done: last });
    },
    [items, item, idx, mode, p, finishSpeed],
  );

  const next = useCallback(() => {
    if (!items) return;
    if (idx + 1 >= items.length) { setIdx(items.length); return; } // → done
    setIdx((n) => n + 1);
    setPhase('ask');
    setChosenRight(null);
  }, [items, idx]);

  if (!items) return <div className="plain muted">…</div>;

  // Speed run finished → the fluency result.
  if (mode === 'speed' && speedOutcome) {
    const fast = speedOutcome.outcome === 'fast';
    return (
      <div className="plain" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem' }}><Emoji e={fast ? '🏅' : '🚀'} /></div>
        <h1>{fast ? t('ground.fast') : t('ground.keepGoing')}</h1>
        <p style={{ fontSize: '1.4rem', margin: '0.6rem 0' }}>{t('ground.speedResult', { c: speedOutcome.correctPerMin.toFixed(0) })}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1.2rem' }}>
          <button className="primary" onClick={() => start('speed')}><Emoji e="⚡" /> {t('ground.again')}</button>
          <a className="next-btn" href="/">{t('common.home')}</a>
        </div>
      </div>
    );
  }

  // Ladder finished → a warm close with real onward options (never a dead end).
  if (mode === 'ladder' && idx >= items.length) {
    return (
      <div className="plain" style={{ textAlign: 'center' }}>
        <h1>{t('ground.doneTitle')}</h1>
        <p className="muted">{t('ground.doneLine')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1.2rem' }}>
          {speedReady && <button className="primary" onClick={() => start('speed')}><Emoji e="⚡" /> {t('ground.speedRun')}</button>}
          <button className={speedReady ? 'next-btn' : 'primary'} onClick={() => start('ladder')}><Emoji e="🌱" /> {t('ground.again')}</button>
          <a className="next-btn" href={`/practice?p=${p}`}>{t('home.startPractice')}</a>
          <a className="next-btn" href="/">{t('common.home')}</a>
        </div>
      </div>
    );
  }

  if (!item) return <div className="plain muted">…</div>;
  const phaseForScene: Phase = mode === 'speed' ? 'ask' : phase; // speed never reveals

  return (
    <div className="ground-wrap">
      <p className="muted ground-count">{idx + 1} / {items.length}</p>
      {item.stage === 'structure' ? (
        <StructureScene item={item} phase={phaseForScene} chosenRight={chosenRight} onChoose={choose} onNext={next} last={idx + 1 >= items.length} />
      ) : item.stage === 'produce' ? (
        <ProduceScene key={idx} item={item} phase={phaseForScene} chosenRight={chosenRight} onChoose={choose} onNext={next} last={idx + 1 >= items.length} />
      ) : (
        <ChoiceScene item={item} phase={phaseForScene} chosenRight={chosenRight} onChoose={choose} onNext={next} last={idx + 1 >= items.length} />
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

// ── Rung 5: produce — type the pictured sum on a numpad (bridge to symbolic) ──
function ProduceScene({ item, phase, chosenRight, onChoose, onNext, last }: SceneProps<Extract<GroundItem, { stage: 'produce' }>>) {
  const { t } = useI18n();
  const [v, setV] = useState('');
  const press = (d: string) => setV((s) => (s.length >= 2 ? s : s + d));
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', null];
  return (
    <>
      <div className="ground-stage">
        {phase === 'ask' ? (
          <div className="ground-prompt">
            <Objects kind={item.kind} n={item.a} />
            <span className="ground-plus">+</span>
            <Objects kind={item.kind} n={item.b} />
          </div>
        ) : (
          <div className="ground-resolved">
            <Objects kind={item.kind} n={item.answer} className="settled" />
            <div className="ground-symbol">{item.a} + {item.b} = {item.answer}</div>
          </div>
        )}
      </div>
      {phase === 'ask' ? (
        <>
          <p className="ground-q">{t('ground.howManyTogether')}</p>
          <div className="ground-entry">{v || ' '}</div>
          <div className="numpad" role="group">
            {keys.map((k, i) =>
              k == null ? (
                <span key={i} className="numpad-gap" aria-hidden />
              ) : (
                <button key={i} className="numpad-key" type="button" onClick={() => press(k)}>{k}</button>
              ),
            )}
            <button className="numpad-key numpad-back" type="button" aria-label="sudda" onClick={() => setV((s) => s.slice(0, -1))}>⌫</button>
            <button className="numpad-key numpad-ok" type="button" aria-label="klar" disabled={v.length === 0} onClick={() => v.length && onChoose(v)}>✓</button>
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
