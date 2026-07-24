'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';
import { useI18n } from '../_components/LocaleProvider';
import { Emoji } from '../_components/Emoji';
import { InputStage, type StageItem, type Captured } from '../_components/InputStage';

type Eligible = { code: string; family: string; armsTest?: boolean };
type BatchItem = { seed: number; answerLength: number };
type Batch = { skillCode: string; family: string; items: BatchItem[] };
type SprintOutcome =
  | { kind: 'milestone' }
  | { kind: 'near_miss'; reason: 'build_speed' | 'keep_clean' }
  | { kind: 'collapse' };
type Bonus = { sprintId: number; units: number };
type Result = { correct: number; errors: number; correctPerMin: number; errorsPerMin: number; aim: number; outcome: SprintOutcome | null; bonus: Bonus | null };

// Interval-based sprint (input-timing A4): a fixed batch of items the client builds
// locally and auto-advances through — no wall-clock timer, no per-item fetch. The
// per-item clock and numpad live in InputStage; the rate is the sum of clean client
// intervals, ingested as one idempotent batch at the end.
function Sprint() {
  const { t } = useI18n();
  const params = useSearchParams();
  const p = params.get('p') ?? '';
  const startCode = params.get('start') ?? ''; // pre-selected victory-lap skill
  const autoGo = params.get('go') === '1'; // already confirmed (done-screen [Kör!])
  const isLap = startCode !== '';
  const [phase, setPhase] = useState<'pick' | 'lap' | 'run' | 'result'>(isLap ? 'lap' : 'pick');
  const [eligible, setEligible] = useState<Eligible[] | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [code, setCode] = useState('');
  const [aborted, setAborted] = useState(false);
  const resultsRef = useRef<{ seed: number; given: string; intervalMs: number }[]>([]);
  const sprintKeyRef = useRef('');
  const startedRef = useRef(false);
  const ingestingRef = useRef(false);

  const loadEligible = useCallback(() => {
    getJSON<{ skills?: Eligible[]; error?: string }>(`/api/sprint/eligible?playerId=${p}`).then((r) => {
      if (r.error) location.href = '/';
      else setEligible((r.skills ?? []).map((s) => ({ code: s.code, family: s.family, armsTest: (s as { armsTest?: boolean }).armsTest })));
    });
  }, [p]);

  const start = useCallback(
    async (c: string) => {
      setCode(c);
      const b = await postJSON<Batch | { error: string }>('/api/sprint/batch', { playerId: p, code: c });
      if ('error' in b) {
        if (isLap) { location.href = `/shelf?p=${p}`; return; }
        return loadEligible();
      }
      resultsRef.current = [];
      sprintKeyRef.current = crypto.randomUUID ? crypto.randomUUID() : `${p}.${Date.now()}.${Math.random()}`;
      ingestingRef.current = false;
      setBatch(b);
      setIndex(0);
      setPhase('run');
    },
    [p, isLap, loadEligible],
  );

  useEffect(() => {
    if (!p) return void (location.href = '/');
    if (isLap) {
      if (autoGo && !startedRef.current) {
        startedRef.current = true;
        start(startCode);
      }
    } else {
      loadEligible();
    }
  }, [p, isLap, autoGo, startCode, start, loadEligible]);

  // Skip the "which speed run?" menu — kids don't know what they're picking. As soon as
  // the eligible list loads, start the EASIEST eligible skill (the list arrives sorted
  // easiest-first). Not random: a child who feels "bad at speed runs" should always meet
  // the clock on the gentlest thing they've got, so it reads as just another calm turn.
  useEffect(() => {
    if (isLap || startedRef.current || phase !== 'pick' || !eligible || eligible.length === 0) return;
    startedRef.current = true;
    start(eligible[0].code);
  }, [isLap, phase, eligible, start]);

  const ingest = useCallback(async () => {
    if (ingestingRef.current) return;
    ingestingRef.current = true;
    const r = await postJSON<Result>('/api/sprint/ingest', { playerId: p, code, sprintKey: sprintKeyRef.current, results: resultsRef.current });
    setResult(r);
    loadEligible(); // refresh which skills are still sprintable → whether "En till" makes sense
    setPhase('result');
  }, [p, code, loadEligible]);

  // Each captured item is recorded locally with its CLEAN interval and the run
  // auto-advances instantly (the batch is already on the client). The last item
  // triggers the single idempotent ingest.
  const onCapture = useCallback((c: Captured) => {
    resultsRef.current.push({ seed: c.seed, given: c.given, intervalMs: c.intervalMs });
    setIndex((i) => i + 1);
  }, []);

  useEffect(() => {
    if (phase === 'run' && batch && index >= batch.items.length && !ingestingRef.current) ingest();
  }, [phase, batch, index, ingest]);

  // A backgrounded sprint didn't happen: discard the in-memory results (nothing was
  // sent yet) and show a calm off-ramp — never a failure.
  useEffect(() => {
    if (phase !== 'run') return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && !ingestingRef.current) {
        resultsRef.current = [];
        setAborted(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [phase]);

  if (aborted) {
    return (
      <div className="plain">
        <p className="muted">{t('sprint.aborted')}</p>
        <p style={{ marginTop: '1rem' }}>
          <a className="idk" href={`/shelf?p=${p}`}>{t('common.back')}</a>
        </p>
      </div>
    );
  }

  if (phase === 'lap') {
    return (
      <div className="plain">
        {autoGo ? (
          <p className="muted">…</p>
        ) : (
          <>
            <h1>{t('sprint.lapTitle')}</h1>
            <p className="muted">{t('sprint.lapReady', { skill: startCode.replace(/_/g, ' ') })}</p>
            <p style={{ marginTop: '1.5rem' }}>
              <button className="primary" onClick={() => start(startCode)}>{t('sprint.lapGo')}</button>{' '}
              <a className="idk" href={`/shelf?p=${p}`}>{t('common.back')}</a>
            </p>
          </>
        )}
      </div>
    );
  }

  if (!isLap && eligible == null) return <div className="plain muted">…</div>;

  if (phase === 'pick' && eligible) {
    if (eligible.length === 0) {
      return (
        <div className="plain">
          <h1>{t('sprint.title')}</h1>
          <p className="muted">{t('sprint.noneReady')}</p>
          <p style={{ marginTop: '2rem' }}>
            <a className="idk" href="/">{t('common.back')}</a>
          </p>
        </div>
      );
    }
    return <div className="plain muted">…</div>; // auto-starting a random eligible skill
  }

  if (phase === 'run' && batch) {
    if (index >= batch.items.length) return <div className="plain muted">…</div>; // ingesting
    const it = batch.items[index];
    const item: StageItem = { code: batch.skillCode, seed: it.seed, family: batch.family, answerLength: it.answerLength };
    return (
      <div className="stage">
        <div className="muted" style={{ position: 'fixed', top: '1rem' }}>{batch.items.length - index}</div>
        <InputStage mode="sprint" item={item} playerId={p} onCapture={onCapture} />
      </div>
    );
  }

  // Result: a speed run is just another calm turn, never a verdict. EVERY finish shows
  // the same quiet "done" — no speed number, no faster/slower coaching, no crossing
  // spotlight — so a run can't be read as pass/fail and a child can't come away "bad at
  // speed runs". A crossing still records its diploma (witnessed later, privately, in the
  // room) and auto-sends its bonus to the shared goal, both off-screen. Only a collapse
  // shows a different screen, and only to route gently to untimed practice.
  const outcome = result?.outcome ?? null;
  const skillName = code.replace(/_/g, ' ');
  // "En till?" only when ANOTHER eligible skill remains; it starts the EASIEST of them
  // (the list is easiest-first), so a second turn stays as gentle as the first.
  const remaining = eligible ?? [];
  const againButton =
    remaining.length > 0 ? (
      <button
        className="primary"
        onClick={() => {
          startedRef.current = false;
          setResult(null);
          start(remaining[0].code);
        }}
      >
        {t('sprint.again')}
      </button>
    ) : null;
  const backLink = <a className="next-btn" href={isLap ? `/shelf?p=${p}` : '/'}>{t('common.back')}</a>;

  if (outcome?.kind === 'collapse') {
    return (
      <div className="plain">
        <h1>{t('sprint.collapseTitle')}</h1>
        <p className="muted" style={{ marginTop: '0.6rem' }}>{t('sprint.collapseLine', { skill: skillName })}</p>
        <p style={{ marginTop: '1.5rem' }}>
          <a className="primary" href={`/practice?p=${p}&start=${encodeURIComponent(code)}`}>{t('sprint.toPractice')}</a>{' '}
          {backLink}
        </p>
      </div>
    );
  }

  return (
    <div className="plain" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '3rem' }}><Emoji e="🎉" /></div>
      <h1>{t('sprint.done')}</h1>
      <p style={{ marginTop: '1.5rem' }}>{againButton} {backLink}</p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="plain muted">…</div>}>
      <Sprint />
    </Suspense>
  );
}
