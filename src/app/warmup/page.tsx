'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { postJSON } from '@/lib/client';
import { useI18n } from '../_components/LocaleProvider';
import { InputStage, type Captured } from '../_components/InputStage';

type Started = { toolId: string; numbers: string[] };
type Copy = { i: number; given: string; intervalMs: number };

// The writing-speed probe. It measures how fast a child enters digits on the SAME
// numpad they answer real problems with (it used to be the OS keyboard, a different
// surface than the sprint), so the input floor it produces is comparable to the
// sprint rate it grounds. The child copies a handful of shown numbers; each item's
// interval is client-measured by InputStage exactly as in a sprint.
function Warmup() {
  const { t } = useI18n();
  const p = useSearchParams().get('p') ?? '';
  const [phase, setPhase] = useState<'intro' | 'run' | 'done'>('intro');
  const [started, setStarted] = useState<Started | null>(null);
  const [idx, setIdx] = useState(0);
  const copiesRef = useRef<Copy[]>([]);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!p) location.href = '/';
  }, [p]);

  async function begin() {
    const s = await postJSON<Started>('/api/tool/start', { playerId: p });
    copiesRef.current = [];
    submittedRef.current = false;
    setStarted(s);
    setIdx(0);
    setPhase('run');
  }

  const finish = useCallback(async () => {
    if (!started || submittedRef.current) return;
    submittedRef.current = true;
    await postJSON('/api/tool/submit', { playerId: p, toolId: started.toolId, copies: copiesRef.current });
    setPhase('done');
  }, [started, p]);

  const onCapture = useCallback(
    (c: Captured) => {
      copiesRef.current.push({ i: idx, given: c.given, intervalMs: c.intervalMs });
      if (idx + 1 >= (started?.numbers.length ?? 0)) finish();
      else setIdx((n) => n + 1);
    },
    [idx, started, finish],
  );

  if (phase === 'intro') {
    return (
      <div className="plain">
        <h1>{t('warmup.title')}</h1>
        <p className="muted">{t('warmup.intro')}</p>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginTop: '1rem' }}>
          <button className="primary" onClick={begin}>{t('warmup.start')}</button>
          <a className="idk" href="/">{t('warmup.later')}</a>
        </div>
      </div>
    );
  }

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

  return (
    <div className="plain">
      <h1>{t('warmup.done')}</h1>
      <p className="muted">{t('warmup.thanks')}</p>
      <a className="primary" href="/" style={{ marginTop: '1rem' }}>{t('common.home')}</a>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="plain muted">…</div>}>
      <Warmup />
    </Suspense>
  );
}
