import 'server-only';
import * as repo from '@/db/repo';
import {
  BUILDS,
  BUILDS_BY_ID,
  buildDoneCapability,
  tierUnlocked,
  type BuildDef,
  type VoltageTier,
} from './electronics-builds';
import { fluencyMet, fluencyFluentMeasured } from './electronics-fluency-seam';
import {
  KORKORT,
  korkortState,
  type KorkortDef,
  type KorkortState,
  type FluencyOf,
} from './electronics-korkort';

// ── The readiness detector + the grownup ALERT (docs/electronics-subject-plan.md §2b) ───────────
//
// A CONSUMER that sits beside the engine. It reads the fluency signal's `met` axis (through the
// electronics-fluency-seam integration point) and the child's durable capability facts, and derives
// which builds are ready. It writes NOTHING to the ledger; the only writes this subsystem makes are
// the adult-confirmed capability grants in repo (θ-inert). A11 boundary: STOP-and-report if the
// engine ever seems to need to reason about a build.

export type SkillPrereqStatus = { code: string; met: boolean };

// Why a build is / isn't ready — every clause, so the surface can show exactly what remains.
export type BuildReadiness = {
  build: BuildDef;
  status: 'ready' | 'locked' | 'done';
  skills: SkillPrereqStatus[]; // per-skill fluency `met`
  skillsMet: boolean;
  equipment: { code: string; owned: boolean }[];
  equipmentOwned: boolean;
  tierUnlocked: boolean;
};

function doneCapForBuild(owned: ReadonlySet<string>, build: BuildDef): boolean {
  return owned.has(buildDoneCapability(build.id));
}

// Compute one build's readiness against a child's fluency-met lookups + owned capabilities.
export function buildReadiness(playerId: string, build: BuildDef, owned: ReadonlySet<string>): BuildReadiness {
  const skills = build.skill_prereqs.map((code) => ({ code, met: fluencyMet(playerId, code) }));
  const skillsMet = skills.every((s) => s.met);
  const equipment = build.equipment_prereqs.map((code) => ({ code, owned: owned.has(code) }));
  const equipmentOwned = equipment.every((e) => e.owned);
  const tierOk = tierUnlocked(build.voltage_tier, owned);

  const status: BuildReadiness['status'] = doneCapForBuild(owned, build)
    ? 'done'
    : skillsMet && equipmentOwned && tierOk
      ? 'ready'
      : 'locked';

  return { build, status, skills, skillsMet, equipment, equipmentOwned, tierUnlocked: tierOk };
}

// The whole ladder for a child — every authored build with its status. The grownup + kid surface
// renders this.
export function buildLadder(playerId: string): BuildReadiness[] {
  const owned = repo.electronicsCapabilities(playerId);
  return BUILDS.map((b) => buildReadiness(playerId, b, owned));
}

// ── The grownup ALERT ───────────────────────────────────────────────────────────────────────
// Mirrors the acquisition grownup-alert FALLBACK (repo.stalledAcquisitions / lib.stalledAcquisitions):
// a PURE DETECTOR — no fired-state row, no acknowledgement column. It reports the builds a child is
// currently READY for (and hasn't completed). A build drops off the moment its completion is
// adult-confirmed. The alert carries everything Erik needs to pre-pack a kit without latency: the
// child, the build, its tier, the kit/BOM, and the kid+adult instructions.
//
// (A future `acknowledged_at` — "Erik has seen this, stop surfacing it" — is the natural extension,
// exactly as the acquisition alert would gain one; deliberately not built for slice 1.)
export type BuildAlert = {
  playerId: string;
  buildId: string;
  buildName: string;
  tier: VoltageTier;
  kitBom: { qty: number; part: string }[];
  instructions: string[];
};

export function buildAlerts(playerId: string): BuildAlert[] {
  return buildLadder(playerId)
    .filter((r) => r.status === 'ready')
    .map((r) => ({
      playerId,
      buildId: r.build.id,
      buildName: r.build.name,
      tier: r.build.voltage_tier,
      kitBom: r.build.kit_bom.map((l) => ({ qty: l.qty, part: l.part })),
      instructions: [...r.build.instructions.kid_adult],
    }));
}

// ── KÖRKORT wiring (docs/electronics-korkort-flow.md) ───────────────────────────────────────────
// The consumer side of the PURE körkort derivation: it binds the fluency seam (measurability-aware —
// typed skills need measured, choice skills need met) and the child's owned capabilities to
// `korkortState`, so the shelf + the phase-1 reveal can render
// LOCKED / TODO / EARNED. No new record backs EARNED — it derives from the `elec_cap_tier_*`
// capability the existing adult-approval already grants (confirmBuildComplete). θ-inert: reads the
// fluency signal beside the engine, writes nothing.

// One körkort's shelf-facing view for a child.
export type KorkortView = {
  id: string;
  namn: string;
  tier: string;
  state: KorkortState;
  prov: string;
  grants: string;
  kitBom: { qty: number; part: string }[];
  instructions: { kid: string[]; adult: string[] };
};

// Bind the fluency seam for a child into the pure `FluencyOf` the derivation wants.
function fluencyOfFor(playerId: string): FluencyOf {
  return (code) => fluencyFluentMeasured(playerId, code);
}

function korkortView(k: KorkortDef, state: KorkortState): KorkortView {
  return {
    id: k.id,
    namn: k.namn,
    tier: k.tier,
    state,
    prov: k.prov,
    grants: k.grants,
    kitBom: k.kitBom.map((l) => ({ qty: l.qty, part: l.part })),
    instructions: { kid: [...k.instructions.kid], adult: [...k.instructions.adult] },
  };
}

// Every körkort's state for a child (LOCKED / TODO / EARNED), derived from fluency + capabilities.
export function korkortStatuses(playerId: string): KorkortView[] {
  const owned = repo.electronicsCapabilities(playerId);
  const fluencyOf = fluencyOfFor(playerId);
  return KORKORT.map((k) => korkortView(k, korkortState(k, fluencyOf, owned)));
}

// The child's shelf körkort: only what they own or are ready to build (TODO + EARNED) — LOCKED
// körkort are not shown (nothing to witness yet, and never a comparison). Their own shelf only.
export function shelfKorkort(playerId: string): KorkortView[] {
  return korkortStatuses(playerId).filter((v) => v.state !== 'locked');
}

// Phase-1 reveal: the körkort that are TODO now AND whose flip is attributable to a fluency crossing
// that happened THIS session (a code in `crossedCodes`). A körkort flips to TODO exactly when its LAST
// remaining requirement reaches fluent && measured; that measured crossing is one of this session's
// diplomas — so this fires in the flip session and not forever after. Returns the display names.
export function newlyTodoKorkort(playerId: string, crossedCodes: readonly string[]): string[] {
  if (crossedCodes.length === 0) return [];
  const crossed = new Set(crossedCodes);
  const owned = repo.electronicsCapabilities(playerId);
  const fluencyOf = fluencyOfFor(playerId);
  return KORKORT.filter(
    (k) =>
      korkortState(k, fluencyOf, owned) === 'todo' &&
      k.fluencyRequires.some((c) => crossed.has(c)),
  ).map((k) => k.namn);
}

// Which körkort a given capability grant EARNS — so the adult-approval surface can name the körkort a
// build completion just unlocked. Derived from the registry (no körkort-specific record needed).
export function korkortEarnedByCapability(capability: string): KorkortDef | null {
  return KORKORT.find((k) => k.grants === capability) ?? null;
}

// ── Adult-confirmed writes (the ONE write that crosses back, boundary §3) ───────────────────────

// Grant an equipment/safety capability directly (e.g. an adult confirms the child owns a
// breadboard). Idempotent — first grant wins.
export function confirmCapability(playerId: string, capability: string, now: number): boolean {
  return repo.grantElectronicsCapability(playerId, capability, 'adult_confirm', now);
}

// Adult-confirms a build is complete. Writes the durable `build_<id>_done` fact AND every capability
// the build grants (climbing the ladder — the coin-cell build grants elec_cap_tier_3v, which opens
// the next tier's lock). θ-inert: no attempt/ability row is touched. Returns the granted codes.
export function confirmBuildComplete(playerId: string, buildId: string, now: number): { granted: string[] } | null {
  const build = BUILDS_BY_ID.get(buildId);
  if (!build) return null;
  const granted: string[] = [];
  if (repo.grantElectronicsCapability(playerId, buildDoneCapability(buildId), `build:${buildId}`, now)) {
    granted.push(buildDoneCapability(buildId));
  }
  for (const cap of build.grants) {
    if (repo.grantElectronicsCapability(playerId, cap, `build:${buildId}`, now)) granted.push(cap);
  }
  return { granted };
}
