import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { submitToolMeasure } from '@/lib/sprint';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  playerId: z.string().min(1),
  toolId: z.string().min(1),
  copies: z.array(z.object({ i: z.number().int().min(0), given: z.string().max(12), intervalMs: z.number().min(0) })).max(64),
});

export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const result = submitToolMeasure(player.id, parsed.data.toolId, parsed.data.copies, now);
  if (!result) return json({ error: 'no_measure' }, 410);
  return json(result);
}
