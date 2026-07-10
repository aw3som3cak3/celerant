'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { postJSON } from '@/lib/client';

type Started = { toolId: string; target: string; durationS: number; endsAt: number };

function Warmup() {
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
    const s = await postJSON<Started>('/api/tool/start', { playerId: p, durationS: 60 });
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
        <h1>Skrivhastighet</h1>
        <p className="muted">Skriv av siffrorna så snabbt du bekvämt kan i en minut. Det finns inget rätt eller fel här.</p>
        <button className="primary" onClick={begin}>Börja</button>{' '}
        <a className="idk" href={`/sprint?p=${p}`}>senare</a>
      </div>
    );
  }

  if (phase === 'run' && started) {
    const groups = started.target.match(/.{1,5}/g)?.slice(0, 40).join(' ');
    return (
      <div className="plain">
        <p className="muted">{remaining}s</p>
        <div style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.15em', lineHeight: 2, fontSize: '1.2rem' }}>{groups}</div>
        <textarea ref={areaRef} className="field" rows={4} style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.15em', fontSize: '1.2rem' }} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="skriv siffrorna här" />
        <button className="idk" onClick={finish}>klar</button>
      </div>
    );
  }

  return (
    <div className="plain">
      <h1>Klart.</h1>
      <p className="muted">Skrivhastighet: {result?.toFixed(0)} siffror per minut.</p>
      <a className="menu-link" href={`/sprint?p=${p}`}>Till sprint</a>
      <a className="menu-link" href="/">Hem</a>
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
