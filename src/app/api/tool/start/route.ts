import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { startToolMeasure } from '@/lib/sprint';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string().min(1), durationS: z.union([z.literal(30), z.literal(60)]).optional() });

// Writing-speed measurement. Opt-in — the first time a child opens sprint mode
// (ui-lifecycle §4.5). It refines the aim; it does not authorise anything.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);
  return json(startToolMeasure(player.id, parsed.data.durationS ?? 60, now));
}
