import 'server-only';
import { fluencySignal } from './fluency-signal';

// ── THE SINGLE INTEGRATION POINT: electronics readiness ↔ the fluency signal ────────────────────
//
// The build ladder is a CONSUMER of the outward fluency signal (docs/electronics-celerant-boundary
// §3): "a build is ready when every skill in its prerequisite set reports `met`." It reads the
// existing signal's `met` axis — it never reads raw θ, and never feeds the selector/θ/gate/ledger.
//
// REAL WIRING (default): `fluencySignal(playerId, code).met`. That function already answers
// met/fluent/confidence for one child + one code (src/lib/fluency-signal.ts, reused verbatim). The
// OTHER agent authors the 8 electronics skill codes in src/skills.ts (BY_CODE); until their slice
// lands, `fluencySignal` returns `{ met:false, … }` for an unknown code, so an electronics build is
// simply never ready — which is correct. When their skills merge, THIS seam lights up with no
// change here.
//
// TESTS: `__setFluencyMetLookup` swaps the lookup so the readiness detector can run standalone,
// without the other agent's skills present. Production never calls the setter.
export type MetLookup = (playerId: string, code: string) => boolean;

const REAL_LOOKUP: MetLookup = (playerId, code) => fluencySignal(playerId, code).met;

let lookup: MetLookup = REAL_LOOKUP;

// The one call the readiness detector makes per skill prerequisite.
export function fluencyMet(playerId: string, code: string): boolean {
  return lookup(playerId, code);
}

// Test seam only. Pass a stub to override; pass null to restore the real wiring.
export function __setFluencyMetLookup(fn: MetLookup | null): void {
  lookup = fn ?? REAL_LOOKUP;
}
