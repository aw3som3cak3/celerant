'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';
import { CelerationChart, type ChartData } from '../_components/CelerationChart';
import { useI18n } from '../_components/LocaleProvider';
import { useWakeLock } from '../_components/useWakeLock';
import { AnswerInput } from '../_components/AnswerInput';

type Eligible = { code: string; family: string; accuracy: number; aim: number; rate: number | null };
type Started = { sprintId: string; prompt: string; durationS: number; endsAt: number; family: string };
type Result = { correct: number; errors: number; durationS: number; correctPerMin: number; errorsPerMin: number; aim: number };
type Step = { done: false; prompt: string; endsAt: number } | { done: true; result: Result };

// A victory-lap sprint reached via a pre-selected skill (?start=CODE from the done
// screen or the shelf ⚡) is fixed-length: no menu, no duration choice — one short,
// self-contained run.
const LAP_DURATION = 30;

function Sprint() {
  const { t } = useI18n();
  const params = useSearchParams();
  const p = params.get('p') ?? '';
  const startCode = params.get('start') ?? ''; // pre-selected victory-lap skill
  const autoGo = params.get('go') === '1'; // already confirmed (done-screen [Kör!]) → skip the "redo?" beat
  const isLap = startCode !== '';
  const [phase, setPhase] = useState<'pick' | 'lap' | 'run' | 'result'>(isLap ? 'lap' : 'pick');
  const [eligible, setEligible] = useState<Eligible[] | null>(null);
  const [duration, setDuration] = useState<20 | 30 | 60>(30);
  const [run, setRun] = useState<{ sprintId: string; prompt: string; endsAt: number; family: string } | null>(null);
  const [value, setValue] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [chart, setChart] = useState<ChartData | null>(null);
  const [code, setCode] = useState('');
  const [aborted, setAborted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const finishedRef = useRef(false);
  const autoStartedRef = useRef(false); // one auto-start only (a lap creates a server session)

  // Keep the screen awake during a live sprint (#2), and never sleep mid-run.
  useWakeLock(phase === 'run');

  const loadEligible = useCallback(() => {
    getJSON<{ skills?: Eligible[]; error?: string }>(`/api/sprint/eligible?playerId=${p}`).then((r) => {
      if (r.error) location.href = '/';
      else setEligible(r.skills ?? []);
    });
  }, [p]);

  const start = useCallback(async (c: string, dur: number) => {
    setCode(c);
    finishedRef.current = false;
    const s = await postJSON<Started | { error: string }>('/api/sprint/start', { playerId: p, code: c, durationS: dur });
    if ('error' in s) {
      // Not eligible any more (or gone): fall back to the ambient menu.
      if (isLap) { location.href = `/shelf?p=${p}`; return; }
      return loadEligible();
    }
    setRun({ sprintId: s.sprintId, prompt: s.prompt, endsAt: s.endsAt, family: s.family });
    setRemaining(s.durationS);
    setValue('');
    setPhase('run');
  }, [p, isLap, loadEligible]);

  useEffect(() => {
    if (!p) return void (location.href = '/');
    if (isLap) {
      if (autoGo && !autoStartedRef.current) {
        autoStartedRef.current = true;
        start(startCode, LAP_DURATION); // confirmed already — straight into the lap
      }
      // else: sit on the 'lap' ready-beat until the child taps Kör
    } else {
      loadEligible();
    }
  }, [p, isLap, autoGo, startCode, start, loadEligible]);

  const finish = useCallback(async () => {
    if (!run || finishedRef.current) return;
    finishedRef.current = true;
    const r = await postJSON<{ result: Result }>('/api/sprint/finish', { playerId: p, sprintId: run.sprintId });
    setResult(r.result);
    setChart(await getJSON<ChartData>(`/api/sprint/chart?playerId=${p}&code=${encodeURIComponent(code)}`));
    setPhase('result');
  }, [run, code, p]);

  useEffect(() => {
    if (phase !== 'run' || !run) return;
    inputRef.current?.focus();
    const iv = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((run.endsAt - Date.now()) / 1000)));
      if (Date.now() >= run.endsAt) finish();
    }, 200);
    return () => clearInterval(iv);
  }, [phase, run, finish]);

  // Interruption during a sprint (#3): if the pad is backgrounded mid-run, ABORT
  // — suppress the timer's finish() and drop the run server-side — so a cut-short,
  // deflated rate is never written. An interrupted sprint simply didn't happen;
  // the child is shown a calm "another time" beat, never a failure.
  useEffect(() => {
    if (phase !== 'run' || !run) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden' || finishedRef.current) return;
      finishedRef.current = true;
      postJSON('/api/sprint/abort', { playerId: p, sprintId: run.sprintId });
      setAborted(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [phase, run, p]);

  async function submit() {
    if (!run || value.trim() === '') return;
    const given = value.trim();
    setValue('');
    const step = await postJSON<Step>('/api/sprint/answer', { playerId: p, sprintId: run.sprintId, given });
    if ('done' in step && step.done) {
      finishedRef.current = true;
      setResult(step.result);
      setChart(await getJSON<ChartData>(`/api/sprint/chart?playerId=${p}&code=${encodeURIComponent(code)}`));
      setPhase('result');
    } else if (!step.done) setRun((r) => (r ? { ...r, prompt: step.prompt } : r));
  }

  // Interrupted mid-run: a calm off-ramp, no failure language ("a sprint can never
  // be failed"). Nothing was recorded; the child can just wander back.
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

  // The victory-lap "ready?" beat — a warm, unhurried invitation, never a countdown
  // into a test. Auto-go (?go=1) skips it and shows a brief loading instead.
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
              <button className="primary" onClick={() => start(startCode, LAP_DURATION)}>{t('sprint.lapGo')}</button>{' '}
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
        <p className="muted">
          <a href={`/warmup?p=${p}`}>{t('sprint.measure')}</a> {t('sprint.measureHint')}
        </p>
        {eligible.length === 0 ? (
          <p className="muted">
            {t('sprint.noneReady')}
          </p>
        ) : (
          <>
            <div style={{ margin: '0.8rem 0' }}>
              {([20, 30, 60] as const).map((d) => (
                <button key={d} className="idk" style={{ color: duration === d ? 'var(--accent)' : undefined }} onClick={() => setDuration(d)}>
                  {d}s
                </button>
              ))}
            </div>
            {eligible.map((s) => (
              <button key={s.code} className="namebtn" onClick={() => start(s.code, duration)}>
                {s.family} · {s.code.replace(/_/g, ' ')}
              </button>
            ))}
          </>
        )}
        <p style={{ marginTop: '2rem' }}>
          <a className="idk" href="/">{t('common.back')}</a>
        </p>
      </div>
    );
  }

  if (phase === 'run' && run) {
    return (
      <div className="stage">
        <div className="muted" style={{ position: 'fixed', top: '1rem' }}>{remaining}s</div>
        <div className="prompt">{run.prompt}</div>
        {/* The SAME answer row practice uses — numeric keypad + a ✓ submit button —
            so a child can actually submit on a tablet (the sprint's old inline
            input was Enter-only and un-submittable on a soft keypad). */}
        <AnswerInput
          family={run.family}
          show
          value={value}
          inputRef={inputRef}
          onChange={setValue}
          onSubmit={submit}
          canSubmit={value.trim() !== ''}
          showSubmit
          submitLabel={t('pin.submit')}
        />
      </div>
    );
  }

  // The victory lap's own screen: the child's speed and their own rising line —
  // no aim, no pass/fail, no errors-as-verdict. "A sprint can never be failed, it
  // can only be done." The chart draws showAim off (its default), so nothing on
  // this page reads as a bar to clear.
  return (
    <div className="plain">
      <h1>{t('sprint.done')}</h1>
      {result && <p style={{ fontSize: '1.5rem', margin: '0.6rem 0' }}>{t('sprint.yourSpeed', { c: result.correctPerMin.toFixed(0) })}</p>}
      {chart && <CelerationChart data={chart} />}
      <p style={{ marginTop: '1.5rem' }}>
        {isLap ? (
          <button className="primary" onClick={() => start(startCode, LAP_DURATION)}>{t('common.again')}</button>
        ) : (
          <button className="primary" onClick={() => { setPhase('pick'); loadEligible(); }}>{t('common.again')}</button>
        )}{' '}
        <a className="idk" href={isLap ? `/shelf?p=${p}` : '/'}>{t('common.back')}</a>
      </p>
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
