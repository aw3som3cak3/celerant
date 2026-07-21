import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { sessionFromRequest } from '@/lib/auth';
import { ROSTER_BY_ID } from '@/reward/roster';
import { rewardState } from '@/lib/reward';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Redirect a sprint MILESTONE bonus to a different target (cat / family goal). One
// tap on the sprint done screen, exactly like a session's allocation — but this
// pays in bonus UNITS (never a session/pass). The bonus already exists (auto-
// directed to the shared target when the aim was crossed); this only moves it.
// Idempotent: one bonus_allocation row per crossing sprint, upserted.
const Body = z.object({
  sprintId: z.number().int(),
  target: z.object({ kind: z.enum(['cat', 'family', 'prop']), id: z.string().min(1) }),
});

export async function POST(req: NextRequest) {
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ error: 'unauthorized' }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const { sprintId, target } = parsed.data;

  if (target.kind === 'cat' && ROSTER_BY_ID.get(target.id)?.kind !== 'cat') return json({ error: 'bad_target' }, 400);
  if (target.kind === 'prop' && ROSTER_BY_ID.get(target.id)?.kind !== 'prop') return json({ error: 'bad_target' }, 400);
  if (target.kind === 'family' && target.id !== 'family') return json({ error: 'bad_target' }, 400);

  // Only an EXISTING milestone bonus can be redirected — never conjured. It carries
  // its own family (auth) and units (never re-read the constant, so a redirect can
  // never change the award size).
  const bonus = repo.bonusAllocationForSprint(sprintId);
  if (!bonus) return json({ error: 'not_found' }, 404);
  if (bonus.family_id !== s.familyId) return json({ error: 'forbidden' }, 403);

  repo.setBonusAllocation(sprintId, bonus.player_id, s.familyId, target.kind, target.id, bonus.units, now);
  return json({ ok: true, reward: rewardState(s.familyId) });
}
