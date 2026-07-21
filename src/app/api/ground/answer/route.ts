import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import * as repo from '@/db/repo';
import { buildScene } from '@/lib/ground';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  playerId: z.string().min(1),
  seed: z.number().int(),
  chosen: z.enum(['combine', 'separate']),
  done: z.boolean().optional(), // the last scene of the run — logs 'ground_done'
});

// Record one structure-choice. The server rebuilds the scene from the seed and grades
// it — the client never sends (nor knows) the correct structure. Append-only into
// ground_event, which no model path ever reads: writing this can't change what the
// child is served in drill (spec §3, shadow mode).
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const { seed, chosen, done } = parsed.data;
  const scene = buildScene(seed);
  const correct = chosen === scene.structure;
  repo.appendGroundEvent(player.id, scene.structure, JSON.stringify({ kind: scene.kind, a: scene.a, b: scene.b }), chosen, correct, now);
  if (done) repo.appendUsageEvent(player.id, 'ground_done', null, now);
  return json({ correct });
}
