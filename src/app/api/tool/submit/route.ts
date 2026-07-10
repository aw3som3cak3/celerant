import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { submitToolMeasure } from '@/lib/sprint';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string().min(1), toolId: z.string().min(1), typed: z.string().max(4000) });

export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const result = submitToolMeasure(player.id, parsed.data.toolId, parsed.data.typed, now);
  if (!result) return json({ error: 'no_measure' }, 410);
  return json(result);
}
