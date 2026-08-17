import 'server-only';
import { fluencySignal } from './fluency-signal';
import { BY_CODE } from '@/skills';

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

// ── KÖRKORT seam: the fluency axes, measurability-aware ──────────────────────────────────────────
// The build LADDER reads `met` (exposure — "may try at the bench"). A KÖRKORT is stricter, but the
// right bar DEPENDS ON THE SKILL: a TYPED/produced skill can be sprinted, so it must reach `fluent &&
// measured` (a real crossing — the couch made it reflexive). A CHOICE/recognition skill NEVER sprints,
// so `measured` is unreachable for it (STEAM's "a choice node never reaches the bench threshold"); its
// ceiling is `fluent && met` — the gate is open AND it was actually attempted, not merely grade-seeded.
// `measurable` (typed, i.e. NOT format 'choice') tells the derivation which bar applies. Real wiring
// reads `fluencySignal` + the skill's format; a test setter swaps it.
export type FluentMeasured = { fluent: boolean; measured: boolean; met: boolean; measurable: boolean };
export type FluentLookup = (playerId: string, code: string) => FluentMeasured;

const REAL_FLUENT: FluentLookup = (playerId, code) => {
  const s = fluencySignal(playerId, code);
  const skill = BY_CODE.get(code);
  const measurable = skill != null && skill.format !== 'choice'; // typed skills sprint → 'measured' reachable
  return { fluent: s.fluent, measured: s.confidence === 'measured', met: s.met, measurable };
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
