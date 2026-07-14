import { NextRequest } from 'next/server';
import { sessionFromRequest } from '@/lib/auth';
import { rewardState } from '@/lib/reward';
import { CATS_ENABLED } from '@/lib/flags';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The family's reward state (celerant-cat-collection-spec.md): progress per
// target, unlocked cats, and the resolved shared default. Family-session gated —
// the room is shared, so any family member sees it. Static roster content (names,
// blurbs, sprites) lives in code and is imported by the client directly.
export function GET(req: NextRequest) {
  if (!CATS_ENABLED) return json({ error: 'not_found' }, 404);
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ error: 'unauthorized' }, 401);
  return json(rewardState(s.familyId));
}
