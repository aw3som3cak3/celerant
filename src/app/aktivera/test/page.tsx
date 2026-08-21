'use client';

// A test harness for the parent-activation flow (docs/club-bridge.md §3). TEST FAMILY only. Each click
// mints a fresh THROWAWAY pending family (åk2 + åk4) and hands back its activation link, so Erik can
// walk the real /aktivera page against a disposable family as many times as he likes. The previous
// throwaway is cleaned up server-side (only while still pending — a family he actually activated is left).

import { useState } from 'react';
import { postJSON } from '@/lib/client';
import { TestFamilyGate } from '../../_components/TestFamilyGate';

function Inner() {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function seed() {
    setBusy(true);
    const r = await postJSON<{ activationUrl?: string }>('/api/activate/test-seed', {}).catch(() => null);
    setBusy(false);
    if (r?.activationUrl) setUrl(r.activationUrl);
  }

  return (
    <div className="plain">
      <h1>Aktiveringsflöde (test)</h1>
      <p className="muted">Skapa en engångs-testfamilj och gå igenom aktiveringen som en förälder skulle.</p>
      <p style={{ marginTop: '1.25rem' }}>
        <button className="next-btn" onClick={seed} disabled={busy}>
          {busy ? 'Skapar…' : 'Skapa en testfamilj att aktivera'}
        </button>
      </p>
      {url && (
        <p style={{ marginTop: '1rem' }}>
          <a className="next-btn" href={url}>🔑 Öppna aktiveringssidan →</a>
        </p>
      )}
      <p className="muted" style={{ marginTop: '1.5rem', fontSize: '0.8rem' }}>
        Dessa är engångs-testfamiljer att kasta bort — varje ny skapar rensar den förra.
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <TestFamilyGate>
      <Inner />
    </TestFamilyGate>
  );
}
