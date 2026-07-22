import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { sessionFromRequest, parentFamilyFromRequest } from '@/lib/auth';
import { hasSprintAvailable, hasDiplomas } from '@/lib/sprint-eligibility';
import { canGround, groundFirst } from '@/lib/ground-gate';
import { familyIcons } from '@/icons';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ask a child to run the writing-speed test at most once/day, and stop after this
// many real measurements — enough to ground the aim without ever nagging.
const TOOL_TEST_TARGET = 3;

// Session state for the client: the family's two icons, its players (icon +
// årskurs), and whether a parent session is currently elevated. No names.
export function GET(req: NextRequest) {
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ authenticated: false });
  const family = repo.familyById(s.familyId)!;
  const [a, b] = familyIcons(family.icon_display || family.icon_pair); // entered order (icon objects)
  const goalRow = repo.getGoal(s.familyId);
  return json({
    authenticated: true,
    parent: parentFamilyFromRequest(req, now) === s.familyId,
    icons: [a.key, b.key], // KEYS, so the client renders the bundled 3D image
    // No per-child activity on this shared screen: two siblings' rows side by
    // side is a comparison surface (§4.1). The 7-day record is private, shown
    // only behind the child's own icon (the shelf).
    // canSprint drives the ⚡ affordance when a child taps their icon: does this
    // child have ANY skill in the fluency-building band right now? (Derived from
    // eligibility, self-regulating — no cadence.) Per-child capability, not a
    // per-child activity/score, so it stays off the comparison-surface rule.
    // needsToolTest drives the temporary "help make the app better" invitation on
    // the icon tap: fewer than TOOL_TEST_TARGET measurements AND none yet today.
    // Once measured today it's gone until tomorrow; after the target it's gone for
    // good. A per-child capability, not an activity/score — off the comparison rule.
    players: repo.playersInFamily(s.familyId).map((p) => ({
      id: p.id,
      icon: p.icon,
      schoolYear: p.school_year,
      canSprint: hasSprintAvailable(p.id),
      hasDiplomas: hasDiplomas(p.id),
      needsToolTest: repo.toolRateCount(p.id) < TOOL_TEST_TARGET && !repo.measuredToolRateToday(p.id, now),
      // canGround: the quiet, child-initiated door to the GROUND acquisition scene
      // (spec §4). A per-child capability (youngest, still acquiring add/sub, hasn't
      // grounded both structures) — not an activity/score, so off the comparison rule.
      canGround: canGround(p.id),
      // groundFirst: this child is a beginner still BEFORE add_within_10, so GROUND is
      // his first step — the menu leads with it. Once he's climbed the ladder (or made
      // add_within_10 fluent) this goes false and the number drill leads again.
      groundFirst: groundFirst(p.id),
    })),
    // The family goal is cooperative and family-wide, so the family may see it
    // (no per-child breakdown). Only the progress number, never who did what.
    goal: goalRow
      ? {
          label: goalRow.label,
          target: goalRow.target,
          reached: goalRow.reached_at != null,
          progress: repo.familyGoalProgress(s.familyId, goalRow.created_at),
        }
      : null,
  });
}
