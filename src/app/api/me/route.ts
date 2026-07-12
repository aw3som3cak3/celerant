import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { sessionFromRequest, parentFamilyFromRequest } from '@/lib/auth';
import { familyIcons } from '@/icons';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Session state for the client: the family's two icons, its players (icon +
// årskurs), and whether a parent session is currently elevated. No names.
export function GET(req: NextRequest) {
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ authenticated: false });
  const family = repo.familyById(s.familyId)!;
  const [a, b] = familyIcons(family.icon_display || family.icon_pair); // entered order
  const goalRow = repo.getGoal(s.familyId);
  return json({
    authenticated: true,
    parent: parentFamilyFromRequest(req, now) === s.familyId,
    icons: [a.glyph, b.glyph],
    // No per-child activity on this shared screen: two siblings' rows side by
    // side is a comparison surface (§4.1). The 7-day record is private, shown
    // only behind the child's own icon (the shelf).
    players: repo.playersInFamily(s.familyId).map((p) => ({ id: p.id, icon: p.icon, schoolYear: p.school_year })),
    // The family goal is cooperative and family-wide, so the family may see it
    // (no per-child breakdown). Only the progress number, never who did what.
    goal: goalRow
      ? {
          label: goalRow.label,
          target: goalRow.target,
          reached: goalRow.reached_at != null,
          progress: repo.completedSessionsForFamily(s.familyId, goalRow.created_at),
        }
      : null,
  });
}
