import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { startSprint } from '@/lib/sprint';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  playerId: z.string().min(1),
  code: z.string().min(1),
  durationS: z.union([z.literal(20), z.literal(30), z.literal(60)]),
});

export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const started = startSprint(player.id, parsed.data.code, parsed.data.durationS, now);
  if (!started) return json({ error: 'not_eligible' }, 409);
  return json(started);
}
