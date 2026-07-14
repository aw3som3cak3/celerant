import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { sessionFromRequest } from '@/lib/auth';
import { ROSTER_BY_ID } from '@/reward/roster';
import { rewardState } from '@/lib/reward';
import { CATS_ENABLED } from '@/lib/flags';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ target: z.object({ kind: z.enum(['cat', 'family']), id: z.string().min(1) }) });

// Set the family's shared DEFAULT target ("let's all collect for Pythagoras").
// Cooperative and family-wide, so any family-session member may set it — it's just
// a default; each kid can still redirect their own session.
export async function POST(req: NextRequest) {
  if (!CATS_ENABLED) return json({ error: 'not_found' }, 404);
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ error: 'unauthorized' }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const { target } = parsed.data;

  if (target.kind === 'cat' && ROSTER_BY_ID.get(target.id)?.kind !== 'cat') return json({ error: 'bad_target' }, 400);
  if (target.kind === 'family' && target.id !== 'family') return json({ error: 'bad_target' }, 400);

  repo.setSharedTarget(s.familyId, target.kind, target.id, now);
  return json({ ok: true, reward: rewardState(s.familyId) });
}
