import 'server-only';
import * as repo from '@/db/repo';
import { structureOf, type GroundStructure } from './ground';

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

// Has this child reliably grounded one structure (combine / separate)? Needs a full
// window of evidence — fewer than GROUND_WINDOW choices is "not yet", never a pass.
export function groundedStructure(playerId: string, structure: GroundStructure): boolean {
  const rows = repo.recentGroundChoices(playerId, structure, GROUND_WINDOW);
  if (rows.length < GROUND_WINDOW) return false;
  const correct = rows.reduce((a, r) => a + r.correct, 0);
  return correct >= GROUND_THRESHOLD;
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

// The quiet-door gate (spec §4): GROUND is reachable but not pushed. Offer it to its
// actual audience — the youngest kids, still acquiring add/sub — and let it retire
// itself once both structures are grounded. A capability, not an activity/score, so
// it stays off the comparison-surface rule.
export function canGround(playerId: string): boolean {
  const p = repo.playerById(playerId);
  if (!p || p.school_year > 2) return false;
  return !(groundedStructure(playerId, 'combine') && groundedStructure(playerId, 'separate'));
}
