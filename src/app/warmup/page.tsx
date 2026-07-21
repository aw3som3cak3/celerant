'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { postJSON } from '@/lib/client';
import { useI18n } from '../_components/LocaleProvider';

type Started = { toolId: string; target: string; durationS: number; endsAt: number };

function Warmup() {
  const { t } = useI18n();
  const p = useSearchParams().get('p') ?? '';
  const [phase, setPhase] = useState<'intro' | 'run' | 'done'>('intro');
  const [started, setStarted] = useState<Started | null>(null);
  const [typed, setTyped] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!p) location.href = '/';
  }, [p]);

  async function begin() {
    const s = await postJSON<Started>('/api/tool/start', { playerId: p, durationS: 30 });
    setStarted(s);
    setTyped('');
    submittedRef.current = false;
    setPhase('run');
    setRemaining(s.durationS);
  }

  useEffect(() => {
    if (phase !== 'run' || !started) return;
    areaRef.current?.focus();
    const iv = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((started.endsAt - Date.now()) / 1000)));
      if (Date.now() >= started.endsAt) finish();
    }, 250);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, started]);

  async function finish() {
    if (!started || submittedRef.current) return;
    submittedRef.current = true;
    const r = await postJSON<{ digitsPerMin: number }>('/api/tool/submit', { playerId: p, toolId: started.toolId, typed });
    setResult(r.digitsPerMin);
    setPhase('done');
  }

  if (phase === 'intro') {
    return (
      <div className="plain">
        <h1>{t('warmup.title')}</h1>
        <p className="muted">{t('warmup.intro')}</p>
        <button className="primary" onClick={begin}>{t('warmup.start')}</button>{' '}
        <a className="idk" href="/">{t('warmup.later')}</a>
      </div>
    );
  }

  if (phase === 'run' && started) {
    const groups = started.target.match(/.{1,5}/g)?.slice(0, 40).join(' ');
    return (
      <div className="plain">
        <p className="muted">{remaining}s</p>
        <div style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.15em', lineHeight: 2, fontSize: '1.2rem' }}>{groups}</div>
        <textarea ref={areaRef} className="field" rows={4} inputMode="numeric" autoComplete="off" spellCheck={false} style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.15em', fontSize: '1.2rem' }} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t('warmup.type')} />
        <button className="idk" onClick={finish}>{t('warmup.doneEarly')}</button>
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
