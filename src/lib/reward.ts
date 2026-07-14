import 'server-only';
import * as repo from '@/db/repo';
import { CATS, type Target } from '@/reward/roster';

// The reward state (celerant-cat-collection-spec.md §"Derived cache"). A PURE
// count over the append-only allocations, so it is idempotent — no stored cache to
// drift. progress[targetId] = directed session count; a cat unlocks at its cost.
export type RewardState = {
  progress: Record<string, number>; // targetId -> completed session count (cats + 'family')
  unlockedCats: string[]; // cat ids where progress >= cost, in display order
  sharedTarget: Target; // the resolved current default target
};

// The current default target: the family's set choice if still unresolved, else
// the first not-yet-unlocked cat by order, else the family goal. So a family that
// never sets a target auto-collects Pythagoras first (the room is never empty —
// the approach cue climbs from session one), and once a cat is complete the
// default advances to the next unresolved one.
export function resolveSharedTarget(familyId: string, unlockedIds: string[]): Target {
  const row = repo.getSharedTarget(familyId);
  if (row) {
    const resolved = row.target_kind === 'cat' && unlockedIds.includes(row.target_id);
    if (!resolved) return { kind: row.target_kind, id: row.target_id };
  }
  const nextCat = CATS.find((c) => !unlockedIds.includes(c.id));
  return nextCat ? { kind: 'cat', id: nextCat.id } : { kind: 'family', id: 'family' };
}

export function rewardState(familyId: string): RewardState {
  const catCounts = repo.catAllocationCounts(familyId);
  const progress: Record<string, number> = {};
  const unlocked: { id: string; order: number }[] = [];
  for (const cat of CATS) {
    const n = catCounts.get(cat.id) ?? 0;
    progress[cat.id] = n;
    if (n >= cat.cost) unlocked.push({ id: cat.id, order: cat.order });
  }
  unlocked.sort((a, b) => a.order - b.order);
  const unlockedIds = unlocked.map((u) => u.id);

  // The family goal is the residual: completed sessions not directed to a cat/prop.
  const goal = repo.getGoal(familyId);
  progress['family'] = goal ? repo.familyGoalProgress(familyId, goal.created_at) : 0;

  return { progress, unlockedCats: unlockedIds, sharedTarget: resolveSharedTarget(familyId, unlockedIds) };
}
