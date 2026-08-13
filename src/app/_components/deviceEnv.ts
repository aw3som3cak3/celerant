'use client';

// Model-INVISIBLE device-context capture, for the future normative fluency-aim
// calibration. THE HARD RULE (same discipline as `probe` / `usage_event`): nothing in
// replay(), the selector, the θ update, the aim, or the unlock gate ever reads what this
// produces. It rides the answer + writing-probe POSTs into append-only `env_json`
// columns an analyst reads — never a model path. The job it serves: de-confound a
// measured motor rate from the DEVICE it was measured on (a child slow with a mouse is
// not a slow child — the whole reason this exists).
//
// The browser reports touch-vs-mouse-class HONESTLY (pointerType, coarse/fine,
// maxTouchPoints) but CANNOT tell a mouse from a touchpad — both are a "fine" pointer
// firing identical `pointerType: 'mouse'` events. That one split comes only from `tag`,
// a per-device label a parent sets once (stored on THIS device); it is stamped onto
// every later measurement so the analyst can separate a slow-mouse run from a
// fast-touchpad one.

export type DeviceTag = 'mouse' | 'touchpad' | 'touch';
const TAG_KEY = 'celerant.deviceTag.v1';

// Last pointerType actually observed on a tap — set from a single passive, capture-phase
// listener so EVERY tap surface (numpad, letter pad, choice tiles) contributes without
// threading the pointer event through each onClick.
let lastPointerType: string | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => { const pt = (e as PointerEvent).pointerType; if (pt) lastPointerType = pt; },
    { capture: true, passive: true },
  );
}

export function getDeviceTag(): DeviceTag | null {
  try {
    const v = localStorage.getItem(TAG_KEY);
    return v === 'mouse' || v === 'touchpad' || v === 'touch' ? v : null;
  } catch { return null; }
}
export function setDeviceTag(tag: DeviceTag): void {
  try { localStorage.setItem(TAG_KEY, tag); } catch { /* private mode: capture degrades to passive-only */ }
}

function mm(q: string): boolean { try { return window.matchMedia(q).matches; } catch { return false; } }

// A compact fingerprint, serialised and stored verbatim. Deliberately small — no full
// user-agent string (platform + a mobile flag is enough to bucket the form factor, and
// the full UA is noise-and-fingerprinting we don't want on a child's row).
export function deviceEnv(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
  return {
    pt: lastPointerType,                 // observed tap pointerType: 'mouse' | 'touch' | 'pen'
    fine: mm('(pointer: fine)'),         // a mouse/touchpad/pen present
    coarse: mm('(pointer: coarse)'),     // a touchscreen present
    hover: mm('(hover: hover)'),
    mtp: nav.maxTouchPoints ?? 0,
    mob: nav.userAgentData?.mobile ?? null,
    plat: nav.userAgentData?.platform ?? '',
    vw: window.innerWidth,
    vh: window.innerHeight,
    tag: getDeviceTag(),                 // THE only mouse-vs-touchpad signal (parent-set, per device)
  };
}

// The wire form: a JSON string an analyst parses later, or undefined off-DOM. Stored
// verbatim in the append-only `env_json` column; never parsed by any model path.
export function deviceEnvJson(): string | undefined {
  const e = deviceEnv();
  return e ? JSON.stringify(e) : undefined;
}
