'use client';

import { createElement, useEffect, useRef, useState } from 'react';

// WokwiPart — the CLIENT-ONLY bridge to @wokwi/elements (MIT LitElement web components). These are
// custom elements, so they must be REGISTERED in the browser before they render, and they cannot run
// on the server. The whole surface is loaded ssr:false, and here we additionally:
//   • register the elements ONCE, lazily, via a dynamic import in useEffect (never at module top —
//     that would pull Lit into the server bundle);
//   • gate the actual <wokwi-*> render on a `ready` flag so there is no unregistered-element flash;
//   • set the element's properties IMPERATIVELY through a ref (value/color are real properties on the
//     Lit element, not just attributes), which is the robust path across React versions.
//
// WHY these elements: <wokwi-resistor value> draws the CORRECT colour bands FROM the value — real,
// data-driven bands, not hand-painted. That is the whole point of the composition rung (§7). The
// package is self-contained SVG with NO network calls (CSP/offline-safe — verified: no fetch/XHR).

// Module-level singleton so every part shares one registration promise (idempotent).
let registerPromise: Promise<void> | null = null;
function ensureWokwiRegistered(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve(); // never on the server
  if (!registerPromise) {
    // Importing the package registers all its custom elements as a side effect (@customElement).
    registerPromise = import('@wokwi/elements').then(() => undefined);
  }
  return registerPromise;
}

// Shared hook: true once the custom elements are defined in this browser.
export function useWokwiReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    ensureWokwiRegistered().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

// A real banded resistor. `ohms` drives the colour bands. `lit` is presentational only (a soft glow
// hook handled in CSS on the wrapper) — the resistor element itself has no on/off.
export function WokwiResistor({ ohms }: { ohms: number }) {
  const ref = useRef<HTMLElement | null>(null);
  const ready = useWokwiReady();
  useEffect(() => {
    if (ref.current) (ref.current as unknown as { value: string }).value = String(ohms);
  }, [ohms, ready]);
  if (!ready) return <span className="wokwi-fallback" aria-label={`motstånd ${ohms} Ω`}>{ohms} Ω</span>;
  // createElement with a string tag needs no JSX intrinsic declaration for the custom element.
  return createElement('wokwi-resistor', { ref, value: String(ohms), 'aria-label': `motstånd ${ohms} Ω` });
}

// A real LED. `on` lights it; `color` is the lit colour.
export function WokwiLed({ on, color = 'red' }: { on: boolean; color?: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const ready = useWokwiReady();
  useEffect(() => {
    if (ref.current) {
      const el = ref.current as unknown as { value: boolean; color: string };
      el.value = on;
      el.color = color;
    }
  }, [on, color, ready]);
  if (!ready) return <span className="wokwi-fallback" aria-label={on ? 'lysdiod lyser' : 'lysdiod släckt'}>{on ? '💡' : '⚪'}</span>;
  return createElement('wokwi-led', { ref, color, value: on ? '' : undefined, 'aria-label': on ? 'lysdiod lyser' : 'lysdiod släckt' });
}
