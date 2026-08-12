import 'server-only';
import * as repo from '@/db/repo';
import { CATS, PROPS, FISH_LIFE_MS, type Target } from '@/reward/roster';

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
  liveFish: number; // consumable fish treats earned in the last 48h and not yet eaten (see below)
};

// The current default target: the family's set choice if still unresolved, else
// the first not-yet-unlocked cat by order, else the family goal. So a family that
// never sets a target auto-collects Pythagoras first (the room is never empty —
// the approach cue climbs from session one), and once a cat is complete the
// default advances to the next unresolved one.
export function resolveSharedTarget(familyId: string, unlockedIds: string[], goalOpen = true): Target {
  const row = repo.getSharedTarget(familyId);
  if (row) {
    const resolvedCat = row.target_kind === 'cat' && unlockedIds.includes(row.target_id); // cat already earned → advance
    const staleGoal = row.target_kind === 'family' && !goalOpen; // goal reached/absent → not collectable, so don't point at it
    if (!resolvedCat && !staleGoal) return { kind: row.target_kind, id: row.target_id };
  }
  const nextCat = CATS.find((c) => !unlockedIds.includes(c.id));
  return nextCat ? { kind: 'cat', id: nextCat.id } : { kind: 'family', id: 'family' };
}

// The child's OWN default target (Model A). Their set choice if still unresolved (a cat
// already unlocked is skipped so we advance to the next), else the family default, else
// the next uncollected cat. So each kid steers their own sessions while the cats stay
// shared and pooled — and two kids who pick the same target co-collect it ("together").
export function resolvePlayerTarget(playerId: string, familyId: string, unlockedIds: string[], goalOpen = true): Target {
  const row = repo.getPlayerTarget(playerId);
  if (row) {
    const resolvedCat = row.target_kind === 'cat' && unlockedIds.includes(row.target_id);
    const staleGoal = row.target_kind === 'family' && !goalOpen; // a reached goal is no longer a target
    if (!resolvedCat && !staleGoal) return { kind: row.target_kind, id: row.target_id };
  }
  return resolveSharedTarget(familyId, unlockedIds, goalOpen);
}

// Family-wide reward state; `playerId`, when given, resolves `sharedTarget` to THAT child's
// personal default (progress and unlocks stay family-pooled — cats are shared).
export function rewardState(familyId: string, playerId?: string, now: number = Date.now()): RewardState {
  const counts = repo.targetAllocationCounts(familyId); // cats + props, sessions + bonus units
  const progress: Record<string, number> = {};

  // Cats and PERMANENT props unlock the same way — accumulated count reaches the item's cost.
  // A consumable prop (the fish, `life != null`) is skipped here and handled below.
  const collect = (items: typeof CATS) => {
    const unlocked: { id: string; order: number }[] = [];
    for (const it of items) {
      if (it.life != null) continue; // consumable — never a permanent unlock
      const n = counts.get(it.id) ?? 0;
      progress[it.id] = n;
      if (n >= it.cost) unlocked.push({ id: it.id, order: it.order });
    }
    return unlocked.sort((a, b) => a.order - b.order).map((u) => u.id);
  };
  const unlockedCats = collect(CATS);
  const unlockedProps = collect(PROPS);

  // The fish is CONSUMABLE. Walk its directed units oldest-first: every `cost` units spawns one
  // fish at that unit's time; a fish is alive only inside its `life` window (the cats eat older
  // ones). liveFish = the surviving spawns; progress['fish'] = leftover units toward the next.
  const fish = PROPS.find((p) => p.id === 'fish')!;
  const cutoff = now - (fish.life ?? FISH_LIFE_MS);
  let acc = 0;
  let liveFish = 0;
  for (const e of repo.timedTargetUnits(familyId, fish.id)) {
    acc += e.units;
    while (acc >= fish.cost) {
      acc -= fish.cost;
      if (e.at >= cutoff) liveFish++;
    }
  }
  progress[fish.id] = acc;

  // The family goal is the residual: completed sessions not directed to a cat/prop.
  const goal = repo.getGoal(familyId);
  progress['family'] = goal ? repo.familyGoalProgress(familyId, goal.created_at) : 0;
  const familyGoalOpen = goal != null && goal.reached_at == null;

  const sharedTarget = playerId ? resolvePlayerTarget(playerId, familyId, unlockedCats, familyGoalOpen) : resolveSharedTarget(familyId, unlockedCats, familyGoalOpen);
  return { progress, unlockedCats, unlockedProps, sharedTarget, familyGoalOpen, familyGoalLabel: goal?.label ?? null, liveFish };
}
