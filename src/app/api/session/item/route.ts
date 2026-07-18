import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { issueNext, sessionSelectOpts } from '@/lib/practice';
import * as repo from '@/db/repo';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Issue the NEXT item as (code, server-issued seed) for the client to build and
// render locally (input-timing Phase A). Used for the FIRST item of a session (or a
// chooser pick); subsequent items come folded into /api/session/answer's response,
// so there is no per-item fetch between problems. The answer stays off the client —
// only (code, seed) crosses the wire.
const Body = z.object({
  playerId: z.string().min(1),
  sessionId: z.number().int().optional(),
  chosenCode: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  if (parsed.data.chosenCode) repo.appendUsageEvent(player.id, 'skill_chosen', parsed.data.chosenCode, now); // §4.3
  const opts = sessionSelectOpts(player, parsed.data.sessionId, now, parsed.data.chosenCode);
  return json({ item: issueNext(player.id, player.school_year, now, opts) });
}
