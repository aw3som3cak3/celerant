import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { sessionFromRequest, parentFamilyFromRequest } from '@/lib/auth';
import { hasSprintAvailable, hasDiplomas } from '@/lib/sprint-eligibility';
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
  // Spelling (T2+T3, Sofie audio) is RELEASED to everyone — the Stava door shows for all
  // families. The word-review tool ("Granska orden"), which REVEALS the words, stays a
  // vetting instrument for the test family only (fox+hotdog).
  const isTestFamily = family.icon_pair.includes('fox') && family.icon_pair.includes('hotdog');
  return json({
    authenticated: true,
    parent: parentFamilyFromRequest(req, now) === s.familyId,
    spelling: true, // the Stava door — open to all children
    spellingReview: isTestFamily, // the reveal-the-words vetting tool — test family only
    icons: [a.key, b.key], // KEYS, so the client renders the bundled 3D image
    // No per-child activity on this shared screen: two siblings' rows side by
    // side is a comparison surface (§4.1). The 7-day record is private, shown
    // only behind the child's own icon (the shelf).
    // canSprint drives the ⚡ affordance when a child taps their icon: does this
    // child have ANY skill in the fluency-building band right now? (Derived from
    // eligibility, self-regulating — no cadence.) Per-child capability, not a
    // per-child activity/score, so it stays off the comparison-surface rule.
    // needsToolTest folds the writing-speed probe into the child's FIRST speed run
    // of the day: fewer than TOOL_TEST_TARGET measurements AND none yet today. When
    // set, the ⚡ button routes through /warmup first (then into the real sprint).
    // Once measured today it's gone until tomorrow; after the target it's gone for
    // good. A per-child capability, not an activity/score — off the comparison rule.
    players: repo.playersInFamily(s.familyId).map((p) => ({
      id: p.id,
      icon: p.icon,
      schoolYear: p.school_year,
      canSprint: hasSprintAvailable(p.id),
      hasDiplomas: hasDiplomas(p.id),
      needsToolTest: repo.toolRateCount(p.id) < TOOL_TEST_TARGET && !repo.measuredToolRateToday(p.id, now),
      // Icons used by OTHER members of any group this child is in (docs/groups.md §1) — so the
      // change-icon picker hides them too and a repick can't collide across a group, not just a family.
      groupIcons: [...repo.groupIconsForPlayer(p.id)],
      // (GROUND is no longer a separate scene — its acquisition rungs are the graph's
      // bottom rungs now, served inside practice by the selector, so there is no
      // groundFirst/canGround routing flag any more. one-ova-track WS II.)
    })),
    // The family goal is cooperative and family-wide, so the family may see it
    // (no per-child breakdown). Only the progress number, never who did what.
    goal: goalRow
      ? {
          label: goalRow.label,
          target: goalRow.target,
          reached: goalRow.reached_at != null,
          progress: repo.familyGoalProgress(s.familyId, goalRow.created_at, goalRow.carry_offset),
        }
      : null,
    // Reached-but-unacknowledged goals linger, celebrated on the family screen, until the parent
    // presses Klar. Aggregate only — a label + target, never who reached it.
    celebrated: repo.celebratedGoals(s.familyId).map((g) => ({ id: g.id, label: g.label, target: g.target })),
  });
}
