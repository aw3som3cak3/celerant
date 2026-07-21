import 'server-only';
import * as repo from '@/db/repo';
import { CATS, PROPS, type Target } from '@/reward/roster';

// The reward state (celerant-cat-collection-spec.md §"Derived cache"). A PURE
// count over the append-only allocations, so it is idempotent — no stored cache to
// drift. progress[targetId] = directed session count; a cat unlocks at its cost.
export type RewardState = {
  progress: Record<string, number>; // targetId -> completed session count (cats + props + 'family')
  unlockedCats: string[]; // cat ids where progress >= cost, in display order
  unlockedProps: string[]; // prop ids where progress >= cost, in display order
  sharedTarget: Target; // the resolved current default target
  familyGoalOpen: boolean; // a family goal exists and is not yet reached — the only time it's a spend option
  familyGoalLabel: string | null; // the goal's own name (e.g. "simhallen"), shown as the target's label
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
  const counts = repo.targetAllocationCounts(familyId); // cats + props, sessions + bonus units
  const progress: Record<string, number> = {};

  // Cats and props unlock the same way — accumulated count reaches the item's cost.
  const collect = (items: typeof CATS) => {
    const unlocked: { id: string; order: number }[] = [];
    for (const it of items) {
      const n = counts.get(it.id) ?? 0;
      progress[it.id] = n;
      if (n >= it.cost) unlocked.push({ id: it.id, order: it.order });
    }
    return unlocked.sort((a, b) => a.order - b.order).map((u) => u.id);
  };
  const unlockedCats = collect(CATS);
  const unlockedProps = collect(PROPS);

  // The family goal is the residual: completed sessions not directed to a cat/prop.
  const goal = repo.getGoal(familyId);
  progress['family'] = goal ? repo.familyGoalProgress(familyId, goal.created_at) : 0;
  const familyGoalOpen = goal != null && goal.reached_at == null;

  return { progress, unlockedCats, unlockedProps, sharedTarget: resolveSharedTarget(familyId, unlockedCats), familyGoalOpen, familyGoalLabel: goal?.label ?? null };
}
