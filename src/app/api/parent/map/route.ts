import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { buildParentMap } from '@/lib/map';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The parent's map (the-map.md §6): the full graph, unfogged — every node in its
// true position, all edges, θ in context. Parent-PIN gated. One player at a time.
export function GET(req: NextRequest) {
  const now = Date.now();
  const familyId = parentFamilyFromRequest(req, now);
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
  if (!repo.playerBelongsToFamily(playerId, familyId)) return json({ error: 'not_found' }, 404);
  return json(buildParentMap(playerId));
}
