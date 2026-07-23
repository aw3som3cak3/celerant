'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { postJSON } from '@/lib/client';
import { useI18n } from '../_components/LocaleProvider';
import { InputStage, type Captured } from '../_components/InputStage';

type Started = { toolId: string; numbers: string[] };
type Copy = { i: number; given: string; intervalMs: number };

// The writing-speed probe — the child's FIRST speed run of the day. It measures how
// fast a child enters digits on the SAME numpad they answer real problems with, so the
// input floor it produces is comparable to the sprint rate it grounds. No longer a
// separate "help the app" invitation: it auto-starts and (if the child has a real
// sprint waiting) flows straight into it, so it just reads as the first ⚡ of the day.
// The FIRST number is excluded server-side (orientation, not speed).
function Warmup() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const p = sp.get('p') ?? '';
  const then = sp.get('then') === '1'; // a real sprint is waiting → continue into it
  const [phase, setPhase] = useState<'run' | 'done'>('run');
  const [started, setStarted] = useState<Started | null>(null);
  const [idx, setIdx] = useState(0);
  const copiesRef = useRef<Copy[]>([]);
  const submittedRef = useRef(false);
  const beganRef = useRef(false);

  const begin = useCallback(async () => {
    const s = await postJSON<Started>('/api/tool/start', { playerId: p });
    copiesRef.current = [];
    submittedRef.current = false;
    setStarted(s);
    setIdx(0);
    setPhase('run');
  }, [p]);

  // Auto-start: this is the first speed run, not an opt-in door.
  useEffect(() => {
    if (!p) { location.href = '/'; return; }
    if (beganRef.current) return;
    beganRef.current = true;
    begin();
  }, [p, begin]);

  const finish = useCallback(async () => {
    if (!started || submittedRef.current) return;
    submittedRef.current = true;
    await postJSON('/api/tool/submit', { playerId: p, toolId: started.toolId, copies: copiesRef.current });
    if (then) { location.href = `/sprint?p=${p}`; return; } // flow into the real sprint
    setPhase('done');
  }, [started, p, then]);

  const onCapture = useCallback(
    (c: Captured) => {
      copiesRef.current.push({ i: idx, given: c.given, intervalMs: c.intervalMs });
      if (idx + 1 >= (started?.numbers.length ?? 0)) finish();
      else setIdx((n) => n + 1);
    },
    [idx, started, finish],
  );

  if (phase === 'run' && started) {
    const number = started.numbers[idx];
    return (
      <div className="stage">
        <p className="muted">{idx + 1} / {started.numbers.length}</p>
        <InputStage
          mode="sprint"
          playerId={p}
          item={{ code: 'copy', seed: idx, family: 'copy', answerLength: number.length }}
          promptOverride={number}
          onCapture={onCapture}
        />
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="plain" style={{ textAlign: 'center' }}>
        <h1>{t('warmup.done')}</h1>
        <p className="muted">{t('warmup.thanks')}</p>
        <a className="primary" href="/" style={{ marginTop: '1rem' }}>{t('common.home')}</a>
      </div>
    );
  }

  return <div className="plain muted">…</div>;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="plain muted">…</div>}>
      <Warmup />
    </Suspense>
  );
}
