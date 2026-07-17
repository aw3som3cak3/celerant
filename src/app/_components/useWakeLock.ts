import { useEffect, useRef } from 'react';

// Screen wake-lock (#2). Hold the screen awake while `active` — a problem is on
// screen — so the pad doesn't sleep while a child looks away to count on their
// fingers or physical objects. Released when inactive or unmounted to save
// battery. The lock is dropped automatically when the tab is backgrounded, so we
// re-acquire on visibilitychange→visible. A no-op where the API is unsupported
// (older iOS Safari) — feature-detected, never throws.

// Minimal local typing so this compiles regardless of the TS DOM lib version.
type Sentinel = { release: () => Promise<void>; addEventListener: (type: 'release', cb: () => void) => void };
type WakeLockNav = { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } };

export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<Sentinel | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return;
    const wl = (navigator as unknown as WakeLockNav).wakeLock;
    if (!wl) return;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || sentinelRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const s = await wl.request('screen');
        if (cancelled) { s.release().catch(() => {}); return; }
        sentinelRef.current = s;
        // The OS can drop the lock (e.g. on background); clear our handle so a
        // later resume re-acquires instead of thinking it still holds one.
        s.addEventListener('release', () => { if (sentinelRef.current === s) sentinelRef.current = null; });
      } catch {
        /* permission denied / not allowed in this context — just no lock */
      }
    };
    const release = () => {
      const s = sentinelRef.current;
      sentinelRef.current = null;
      s?.release().catch(() => {});
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') acquire(); };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, [active]);
}
