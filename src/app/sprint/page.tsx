'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';
import { CelerationChart, type ChartData } from '../_components/CelerationChart';
import { useI18n } from '../_components/LocaleProvider';
import { InputStage, type StageItem, type Captured } from '../_components/InputStage';
import { CATS, type Target } from '@/reward/roster';

type Eligible = { code: string; family: string };
type BatchItem = { seed: number; answerLength: number };
type Batch = { skillCode: string; family: string; items: BatchItem[] };
type SprintOutcome =
  | { kind: 'milestone' }
  | { kind: 'near_miss'; reason: 'build_speed' | 'keep_clean' }
  | { kind: 'collapse' };
type Bonus = { sprintId: number; units: number };
type Result = { correct: number; errors: number; correctPerMin: number; errorsPerMin: number; aim: number; outcome: SprintOutcome | null; bonus: Bonus | null };
type RewardData = { progress: Record<string, number>; unlockedCats: string[]; sharedTarget: Target; familyGoalOpen: boolean; familyGoalLabel: string | null };

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
  const [chart, setChart] = useState<ChartData | null>(null);
  const [code, setCode] = useState('');
  const [aborted, setAborted] = useState(false);
  const resultsRef = useRef<{ seed: number; given: string; intervalMs: number }[]>([]);
  const sprintKeyRef = useRef('');
  const startedRef = useRef(false);
  const ingestingRef = useRef(false);

  const loadEligible = useCallback(() => {
    getJSON<{ skills?: Eligible[]; error?: string }>(`/api/sprint/eligible?playerId=${p}`).then((r) => {
      if (r.error) location.href = '/';
      else setEligible((r.skills ?? []).map((s) => ({ code: s.code, family: s.family })));
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

  const ingest = useCallback(async () => {
    if (ingestingRef.current) return;
    ingestingRef.current = true;
    const r = await postJSON<Result>('/api/sprint/ingest', { playerId: p, code, sprintKey: sprintKeyRef.current, results: resultsRef.current });
    setResult(r);
    setChart(await getJSON<ChartData>(`/api/sprint/chart?playerId=${p}&code=${encodeURIComponent(code)}`));
    setPhase('result');
  }, [p, code]);

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
    return (
      <div className="plain">
        <h1>{t('sprint.title')}</h1>
        {eligible.length === 0 ? (
          <p className="muted">{t('sprint.noneReady')}</p>
        ) : (
          eligible.map((s) => (
            <button key={s.code} className="namebtn" onClick={() => start(s.code)}>
              {s.family} · {s.code.replace(/_/g, ' ')}
            </button>
          ))
        )}
        <p style={{ marginTop: '2rem' }}>
          <a className="idk" href="/">{t('common.back')}</a>
        </p>
      </div>
    );
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

  // Result: the fluency outcome made vivid (rising line + a crossing celebration);
  // the +3 milestone units are garnish. A near-miss shows progress + coaching, a
  // collapse routes gently to untimed practice — no failure language anywhere.
  const outcome = result?.outcome ?? null;
  const skillName = code.replace(/_/g, ' ');
  const againButton = isLap ? (
    <button className="primary" onClick={() => start(startCode)}>{t('sprint.againZap')}</button>
  ) : (
    <button className="primary" onClick={() => { setPhase('pick'); loadEligible(); }}>{t('sprint.againZap')}</button>
  );
  const backLink = <a className="idk" href={isLap ? `/shelf?p=${p}` : '/'}>{t('common.back')}</a>;

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

  if (outcome?.kind === 'milestone') {
    return (
      <div className="plain">
        <h1>{t('sprint.milestoneTitle')}</h1>
        <p style={{ fontSize: '1.3rem', margin: '0.5rem 0' }}>{t('sprint.milestoneLine', { skill: skillName })}</p>
        {result && <p className="muted">{t('sprint.yourSpeed', { c: result.correctPerMin.toFixed(0) })}</p>}
        {chart && <CelerationChart data={chart} />}
        {result?.bonus && <SprintBonusAllocation sprintId={result.bonus.sprintId} units={result.bonus.units} />}
        <p style={{ marginTop: '1.5rem' }}>{againButton} {backLink}</p>
      </div>
    );
  }

  const coaching =
    outcome?.kind === 'near_miss'
      ? outcome.reason === 'keep_clean'
        ? t('sprint.nearKeepClean')
        : t('sprint.nearBuildSpeed', { skill: skillName })
      : null;
  return (
    <div className="plain">
      <h1>{t('sprint.done')}</h1>
      {result && <p style={{ fontSize: '1.5rem', margin: '0.6rem 0' }}>{t('sprint.yourSpeed', { c: result.correctPerMin.toFixed(0) })}</p>}
      {coaching && <p className="muted">{coaching}</p>}
      {chart && <CelerationChart data={chart} />}
      <p style={{ marginTop: '1.5rem' }}>{againButton} {backLink}</p>
    </div>
  );
}

// Direct the sprint MILESTONE bonus (the +3 units) to a cat or the family goal —
// already auto-directed to the shared target; this only redirects it.
function SprintBonusAllocation({ sprintId, units }: { sprintId: number; units: number }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<RewardData | null>(null);
  const [chosen, setChosen] = useState<Target | null>(null);

  useEffect(() => {
    getJSON<RewardData>('/api/reward').then((d) => { setData(d); setChosen(d.sharedTarget); });
  }, []);

  async function pick(target: Target) {
    setChosen(target);
    const r = await postJSON<{ reward?: RewardData }>('/api/sprint/allocate-bonus', { sprintId, target });
    if (r.reward) setData(r.reward);
  }

  if (!data || !chosen) return null;
  const cats = CATS.filter((c) => !data.unlockedCats.includes(c.id)).slice(0, 4);
  const same = (a: Target, b: Target) => a.kind === b.kind && a.id === b.id;
  return (
    <div className="alloc-box">
      <div className="alloc-head">{t('sprint.bonusCountsToward', { n: units })}</div>
      <div className="alloc-choices">
        {cats.map((c) => {
          const tgt: Target = { kind: 'cat', id: c.id };
          return (
            <button key={c.id} className={`alloc-chip ${same(chosen, tgt) ? 'on' : ''}`} onClick={() => pick(tgt)}>
              <span className="cat-face" style={{ width: 20, height: 20, backgroundImage: `url(/cats/${c.id}/idle.png)`, backgroundSize: '140px 20px' }} aria-hidden /> {c.name[locale]}
            </button>
          );
        })}
        {data.familyGoalOpen && (
          <button className={`alloc-chip ${chosen.kind === 'family' ? 'on' : ''}`} onClick={() => pick({ kind: 'family', id: 'family' })}>
            🎯 {data.familyGoalLabel ?? t('room.familyGoal')}
          </button>
        )}
      </div>
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
