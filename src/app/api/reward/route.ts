import { NextRequest } from 'next/server';
import { sessionFromRequest } from '@/lib/auth';
import { rewardState } from '@/lib/reward';
import * as repo from '@/db/repo';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The family's reward state (celerant-cat-collection-spec.md): progress per target,
// unlocked cats (family-pooled — the room is shared), and the resolved default target.
// `?p=` scopes the DEFAULT to that child (personal steering); progress/unlocks stay
// family-wide. Family-session gated; the player must belong to the session's family.
export function GET(req: NextRequest) {
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ error: 'unauthorized' }, 401);
  const p = req.nextUrl.searchParams.get('p');
  const playerId = p && repo.playerById(p)?.family_id === s.familyId ? p : undefined;
  return json(rewardState(s.familyId, playerId));
}
