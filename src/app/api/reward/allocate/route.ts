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

const Body = z.object({
  sessionId: z.number().int(),
  target: z.object({ kind: z.enum(['cat', 'family']), id: z.string().min(1) }),
});

// Redirect a completed session's allocation (celerant-cat-collection-spec.md
// §Allocation). One tap on the done screen. Family-session gated; the session must
// belong to this family and be completed. Idempotent (one row per session).
export async function POST(req: NextRequest) {
  if (!CATS_ENABLED) return json({ error: 'not_found' }, 404);
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ error: 'unauthorized' }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const { sessionId, target } = parsed.data;

  // Validate the target exists (a real cat, or the family goal).
  if (target.kind === 'cat' && ROSTER_BY_ID.get(target.id)?.kind !== 'cat') return json({ error: 'bad_target' }, 400);
  if (target.kind === 'family' && target.id !== 'family') return json({ error: 'bad_target' }, 400);

  const run = repo.sessionRunById(sessionId);
  if (!run) return json({ error: 'not_found' }, 404);
  const player = repo.playerById(run.player_id);
  if (!player || player.family_id !== s.familyId) return json({ error: 'forbidden' }, 403);
  if (run.ended_at == null || run.ended_early === 1 || run.completed < run.target) return json({ error: 'not_completed' }, 400);

  repo.setAllocation(sessionId, run.player_id, s.familyId, target.kind, target.id, now);
  return json({ ok: true, reward: rewardState(s.familyId) });
}
