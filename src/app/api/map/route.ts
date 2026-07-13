import { NextRequest } from 'next/server';
import { requirePlayer } from '@/lib/auth';
import { buildChildMap } from '@/lib/map';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The child's map (the-map.md §2): reached cards in graph position, a glowing
// frontier, one ring of silhouettes, then nothing. Private to the child, like
// the shelf it replaces — the parent view never reads this route.
//
// WATCH-ITEM (add-map-icon-title §1, note not a feature): now that the map is
// reachable any time (not only just after a session ends), the signal that access
// was right is that SESSION COUNTS HOLD OR RISE while the map is browsable. If
// session counts DROP while map-visits rise, the map became a destination that
// substitutes for practice, and access should be pulled back toward session-end
// only. It almost certainly won't — the map is inert, not a game — but watch it.
export function GET(req: NextRequest) {
  const now = Date.now();
  const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
  const player = requirePlayer(req, playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);
  return json(buildChildMap(player.id, player.school_year));
}
