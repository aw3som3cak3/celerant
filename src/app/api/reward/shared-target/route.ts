import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { sessionFromRequest } from '@/lib/auth';
import { ROSTER_BY_ID } from '@/reward/roster';
import { rewardState } from '@/lib/reward';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  target: z.object({ kind: z.enum(['cat', 'family', 'prop']), id: z.string().min(1) }),
  p: z.string().optional(), // the child setting their OWN default; absent → the family default
});

// Set a DEFAULT collection target. With `p` (Model A), it's THAT child's personal default
// ("I'm collecting for Pythagoras") — their sessions steer it; cats stay shared and pooled.
// Without `p`, it's the family-wide default (the fallback / "together" pick). Any
// family-session member may set either; the player must belong to the session's family.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ error: 'unauthorized' }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const { target, p } = parsed.data;

  if (target.kind === 'cat' && ROSTER_BY_ID.get(target.id)?.kind !== 'cat') return json({ error: 'bad_target' }, 400);
  if (target.kind === 'prop' && ROSTER_BY_ID.get(target.id)?.kind !== 'prop') return json({ error: 'bad_target' }, 400);
  if (target.kind === 'family' && target.id !== 'family') return json({ error: 'bad_target' }, 400);

  const playerId = p && repo.playerById(p)?.family_id === s.familyId ? p : undefined;
  if (playerId) repo.setPlayerTarget(playerId, target.kind, target.id, now);
  else repo.setSharedTarget(s.familyId, target.kind, target.id, now);
  return json({ ok: true, reward: rewardState(s.familyId, playerId) });
}
