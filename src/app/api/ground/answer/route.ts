import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import * as repo from '@/db/repo';
import { buildGroundItem, gradeGround, conceptKey } from '@/lib/ground';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  playerId: z.string().min(1),
  seed: z.number().int(),
  stage: z.enum(['structure', 'count', 'numeral', 'sum', 'produce']),
  chosen: z.union([z.string().max(16), z.number().int()]),
  intervalMs: z.number().min(0).optional(), // client-measured time to answer
  done: z.boolean().optional(), // the last item of the run — logs 'ground_done'
});

// Record one choice. The server rebuilds the item from seed + stage and grades it —
// the client never sends (nor knows) the correct answer. Append-only into
// ground_event, which no model path ever reads: writing this can't change what the
// child is served in drill (spec §3, shadow mode). The ledger key is the rung's
// concept (combine/separate for structure — feeds the Level-3 gate — else the stage).
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const { seed, stage, chosen, intervalMs, done } = parsed.data;
  const item = buildGroundItem(seed, stage);
  const correct = gradeGround(seed, stage, chosen);
  repo.appendGroundEvent(player.id, conceptKey(item), JSON.stringify(item), String(chosen), correct, now, intervalMs ?? null);
  if (done) repo.appendUsageEvent(player.id, 'ground_done', null, now);
  return json({ correct });
}
