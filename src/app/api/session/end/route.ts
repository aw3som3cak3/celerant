import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import * as repo from '@/db/repo';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string().min(1), sessionId: z.number().int() });

// Ending early is a button, not a failure (§3.1). Recorded, never mentioned.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const run = repo.sessionRunById(parsed.data.sessionId);
  if (run && run.player_id === player.id && run.ended_at == null) {
    repo.endSessionRunEarly(run.id, now);
    repo.appendUsageEvent(player.id, 'session_ended', 'early', now); // §4.3 — abandonment is a signal
  }
  return json({ ok: true });
}
