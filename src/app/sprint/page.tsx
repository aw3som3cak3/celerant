'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';
import { CelerationChart, type ChartData } from '../_components/CelerationChart';
import { useI18n } from '../_components/LocaleProvider';

type Eligible = { code: string; family: string; accuracy: number; aim: number; rate: number | null };
type Started = { sprintId: string; prompt: string; durationS: number; endsAt: number };
type Result = { correct: number; errors: number; durationS: number; correctPerMin: number; errorsPerMin: number; aim: number };
type Step = { done: false; prompt: string; endsAt: number } | { done: true; result: Result };

function Sprint() {
  const { t } = useI18n();
  const p = useSearchParams().get('p') ?? '';
  const [phase, setPhase] = useState<'pick' | 'run' | 'result'>('pick');
  const [eligible, setEligible] = useState<Eligible[] | null>(null);
  const [duration, setDuration] = useState<20 | 30 | 60>(30);
  const [run, setRun] = useState<{ sprintId: string; prompt: string; endsAt: number } | null>(null);
  const [value, setValue] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [chart, setChart] = useState<ChartData | null>(null);
  const [code, setCode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const finishedRef = useRef(false);

  const loadEligible = useCallback(() => {
    getJSON<{ skills?: Eligible[]; error?: string }>(`/api/sprint/eligible?playerId=${p}`).then((r) => {
      if (r.error) location.href = '/';
      else setEligible(r.skills ?? []);
    });
  }, [p]);

  useEffect(() => {
    if (!p) return void (location.href = '/');
    loadEligible();
  }, [p, loadEligible]);

  async function start(c: string) {
    setCode(c);
    finishedRef.current = false;
    const s = await postJSON<Started | { error: string }>('/api/sprint/start', { playerId: p, code: c, durationS: duration });
    if ('error' in s) return loadEligible();
    setRun({ sprintId: s.sprintId, prompt: s.prompt, endsAt: s.endsAt });
    setRemaining(s.durationS);
    setValue('');
    setPhase('run');
  }

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

  if (eligible == null) return <div className="plain muted">…</div>;

  if (phase === 'pick') {
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
              <button key={s.code} className="namebtn" onClick={() => start(s.code)}>
                {s.family} · {s.code.replace(/_/g, ' ')} <span className="muted">· {t('sprint.aimPerMin', { n: s.aim.toFixed(0) })}</span>
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
        <div className="answer-row">
          <input ref={inputRef} className="answer-input" autoComplete="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label="svar" />
        </div>
      </div>
    );
  }

  return (
    <div className="plain">
      <h1>{t('sprint.done')}</h1>
      {result && (
        <p className="muted">
          {t('sprint.result', { c: result.correctPerMin.toFixed(0), e: result.errorsPerMin.toFixed(0), a: result.aim.toFixed(0) })}
        </p>
      )}
      {chart && <CelerationChart data={chart} />}
      <p style={{ marginTop: '1.5rem' }}>
        <button className="primary" onClick={() => { setPhase('pick'); loadEligible(); }}>{t('common.again')}</button>{' '}
        <a className="idk" href="/">{t('common.back')}</a>
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
