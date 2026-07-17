import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { abortSprint } from '@/lib/sprint';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Drop an interrupted sprint without finalizing it (#3), so no cut-short rate is
// ever written. Best-effort: called when the pad is backgrounded mid-sprint.
const Body = z.object({ playerId: z.string().min(1), sprintId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  abortSprint(player.id, parsed.data.sprintId);
  return json({ ok: true });
}
