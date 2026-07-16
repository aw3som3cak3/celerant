import { NextRequest } from 'next/server';
import { requirePlayer } from '@/lib/auth';
import * as repo from '@/db/repo';
import { buildCardShelf } from '@/lib/map';
import { eligibleSprintSkills } from '@/lib/sprint';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The child's card shelf (§3.4), simplified: a trophy shelf of completed skills,
// plus one focused strip per skill they're working on now (what leads into it and
// a hint of what's just beyond). Belongs to the child; the parent view never sees
// it.
export function GET(req: NextRequest) {
  const now = Date.now();
  const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
  const player = requirePlayer(req, playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);
  const shelf = buildCardShelf(player.id, player.school_year);
  return json({
    // The last-7-days record lives here, in the child's own private space —
    // theirs to see, no sibling's to compare.
    days: repo.sessionDaysLast7(player.id, now),
    trophies: shelf.trophies,
    active: shelf.active,
    // Skills mastered enough to run a victory-lap sprint on. The shelf marks these
    // with a ⚡ the child can reach for — ambient, unthrottled, always the child's
    // move, never a nudge from us (fluency-sprint-wiring §6).
    eligible: eligibleSprintSkills(player.id).map((e) => e.code),
  });
}
