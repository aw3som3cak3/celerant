'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { getJSON } from '@/lib/client';

// Gate an eyeball/vet surface (the demos, the granska tools) to the TEST FAMILY only, so a real
// child never lands on a throwaway demo. Reuses the same authorization the granska review pages
// use (the image-review endpoint reports `authorized` for the test family). Children — and their
// hooks — only mount once authorized.
export function TestFamilyGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');
  useEffect(() => {
    getJSON<{ authorized?: boolean }>('/api/stava/image-review')
      .then((r) => setState(r?.authorized ? 'ok' : 'denied'))
      .catch(() => setState('denied'));
  }, []);
  if (state === 'loading') return <div className="stage"><p className="muted">…</p></div>;
  if (state === 'denied') return <div className="stage" style={{ textAlign: 'center' }}><p className="muted">Den här sidan är bara för testfamiljen.</p></div>;
  return <>{children}</>;
}
