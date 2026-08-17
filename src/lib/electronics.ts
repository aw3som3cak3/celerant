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
import { fluencyMet } from './electronics-fluency-seam';

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
