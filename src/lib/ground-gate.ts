import 'server-only';
import * as repo from '@/db/repo';
import { structureOf, stageForConcept, type GroundStructure } from './ground';
import { skillEligibility } from './sprint-eligibility';

// GROUND → drill criterion and the Level-3 gate seam (GROUND-phase spec §3, §5).
//
// SHADOW MODE: everything here is COMPUTED but NOT ENFORCED. `grounded()` is a real
// derived read of the ground_event ledger, but nothing in the drill loop passes it
// into the selector — see GROUND_ENFORCED below. The child's drill experience is
// byte-for-byte what it is without GROUND. We collect the data and watch the
// criterion cross for real kids before it is ever allowed to gate anything.

// Window and threshold are GUESSES, flagged as such. Confirming them against real
// shadow data — does the criterion cross for kids who understand, stay uncrossed for
// kids who don't — is the entire reason GROUND ships in shadow first. Do not treat
// these as settled until that data is in.
export const GROUND_WINDOW = 6; // choices considered, per structure
export const GROUND_THRESHOLD = 5; // of the last GROUND_WINDOW, this many correct (≈83%, clear of the 50% two-option chance floor)

// Has this child reliably grounded one concept — a structure (combine / separate) or
// a higher ladder rung (count / numeral / sum)? Needs a full window of evidence —
// fewer than GROUND_WINDOW choices is "not yet", never a pass.
export function groundedOn(playerId: string, conceptKey: string): boolean {
  const rows = repo.recentGroundChoices(playerId, conceptKey, GROUND_WINDOW);
  if (rows.length < GROUND_WINDOW) return false;
  const correct = rows.reduce((a, r) => a + r.correct, 0);
  return correct >= GROUND_THRESHOLD;
}
// Back-compat name for the two structures specifically (feeds the Level-3 gate).
export function groundedStructure(playerId: string, structure: GroundStructure): boolean {
  return groundedOn(playerId, structure);
}

// The full acquisition ladder, in order. Grounding all of it is "climbed the on-ramp
// into add-within-10".
const LADDER_KEYS = ['combine', 'separate', 'count', 'numeral', 'sum'];
export function ladderGrounded(playerId: string): boolean {
  return LADDER_KEYS.every((k) => groundedOn(playerId, k));
}

// The concept keys a child is accurate (grounded) at — the rungs eligible for a SPEED
// run. A skill you can do reliably earns the fluency (speed) stage, exactly as on the
// symbolic side. De-duped to the scene STAGES the run will draw from (combine/separate
// share the structure scene).
export function groundedRungs(playerId: string): string[] {
  return LADDER_KEYS.filter((k) => groundedOn(playerId, k));
}
export function speedRunStages(playerId: string): string[] {
  return [...new Set(groundedRungs(playerId).map(stageForConcept))];
}
export function hasExploreSpeed(playerId: string): boolean {
  return speedRunStages(playerId).length > 0;
}

// The ground→drill predicate for a single skill. A skill GROUND doesn't cover (mult,
// fractions, compounds — structureOf === null) is grounded by default, so this can
// only ever gate add/sub. This is the function the selector WOULD consult at Level 3.
export function grounded(playerId: string, skillCode: string): boolean {
  const structure = structureOf(skillCode);
  if (structure == null) return true;
  return groundedStructure(playerId, structure);
}

// ───────────────────────────────────────────────────────────────────────────
// THE LEVEL-3 FLIP POINT (spec §5). This is the ONE seam that turns GROUND from an
// observer into a gate. It is DISABLED. To enforce (only once the fluency layer is
// proven AND shadow data shows the criterion is real and its threshold is right):
//
//   in src/lib/practice.ts, where the selector is called, pass the predicate:
//       computeUnlocked(states, (code) => grounded(playerId, code))
//   and selectItem likewise. That single change makes an ungrounded add/sub skill
//   unreachable in drill until the child has grounded its structure.
//
// Until then NOTHING passes a predicate, so computeUnlocked defaults to "everything
// is grounded" and drill is unchanged. Leave this false; flipping it is a decision,
// not a refactor.
export const GROUND_ENFORCED = false as const;

// The quiet-door gate (spec §4): GROUND is reachable but not pushed. Offered to its
// audience — the youngest kids, still acquiring add/sub. It does NOT retire once both
// structures are grounded: a child who enjoyed it (and grounded it) must still be able
// to go back — removing her favourite scene the moment she succeeds is exactly the
// punish-for-mastery trap we avoid, and replays are just more shadow data. Kept a
// capability, not an activity/score, so it stays off the comparison-surface rule.
// GROUND positioned as the PREDECESSOR to add-within-10 (integrating it into the same
// ladder the older kids climb). Rather than hard-locking add_within_10 in the skill
// graph — which would brick every older child who never did GROUND, and fights the
// selector's base-skill fallback — this makes GROUND the FIRST step for a beginner
// still acquiring add_within_10: the home menu leads them into the ladder, and once
// they've climbed it they flow on to the number drill. Older/accurate kids are never
// touched (they're past acquisition), so nobody's progression can break.
export function groundFirst(playerId: string): boolean {
  const p = repo.playerById(playerId);
  if (!p || p.school_year > 2) return false; // only the youngest, GROUND's audience
  if (ladderGrounded(playerId)) return false; // already climbed the on-ramp → move on
  // Only a child NOT yet fluent at add_within_10 is still "before" it; a kid who has
  // made it fluent has passed acquisition and is never sent back.
  const add = skillEligibility(playerId).find((e) => e.code === 'add_within_10');
  return !add || add.band !== 'fluent';
}

export function canGround(playerId: string): boolean {
  const p = repo.playerById(playerId);
  return !!p && p.school_year <= 2;
}
