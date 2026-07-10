import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { sprintAnswer } from '@/lib/sprint';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string().min(1), sprintId: z.string().min(1), given: z.string().max(20) });

export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const step = sprintAnswer(player.id, parsed.data.sprintId, parsed.data.given, now);
  if (!step) return json({ error: 'no_sprint' }, 410);
  return json(step);
}
