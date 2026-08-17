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

// ── KÖRKORT seam: the fluent && measured axes ────────────────────────────────────────────────────
// The build LADDER reads `met` (exposure — "may try at the bench"). A KÖRKORT is stricter: its phase-1
// TODO fires only when the skill is FLUENT (the gate is open) AND the rate was MEASURED (confidence),
// i.e. the couch made it AUTOMATIC — STEAM's rule that the bench uses what the couch made reflexive. A
// merely `met`/`provisional` skill is NOT enough to send a child to build unsupervised. Same seam
// shape as `met`: real wiring reads `fluencySignal`, a test setter swaps it.
export type FluentMeasured = { fluent: boolean; measured: boolean };
export type FluentLookup = (playerId: string, code: string) => FluentMeasured;

const REAL_FLUENT: FluentLookup = (playerId, code) => {
  const s = fluencySignal(playerId, code);
  return { fluent: s.fluent, measured: s.confidence === 'measured' };
};

let fluentLookup: FluentLookup = REAL_FLUENT;

// The one call the körkort derivation's wiring makes per fluencyRequires code.
export function fluencyFluentMeasured(playerId: string, code: string): FluentMeasured {
  return fluentLookup(playerId, code);
}

// Test seam only. Pass a stub to override; pass null to restore the real wiring.
export function __setFluentMeasuredLookup(fn: FluentLookup | null): void {
  fluentLookup = fn ?? REAL_FLUENT;
}
