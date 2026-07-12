import { NextRequest } from 'next/server';
import { requirePlayer } from '@/lib/auth';
import { buildChildMap } from '@/lib/map';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The child's map (the-map.md §2): reached cards in graph position, a glowing
// frontier, one ring of silhouettes, then nothing. Private to the child, like
// the shelf it replaces — the parent view never reads this route.
export function GET(req: NextRequest) {
  const now = Date.now();
  const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
  const player = requirePlayer(req, playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);
  return json(buildChildMap(player.id, player.school_year));
}
