import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { answer } from '@/lib/practice';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  playerId: z.string().min(1),
  itemId: z.string().min(1),
  sessionId: z.number().int().optional(),
  given: z.string().max(20).optional(),
  idk: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);

  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const result = answer(
    player.id,
    parsed.data.itemId,
    parsed.data.given ?? null,
    parsed.data.idk ?? false,
    now,
    parsed.data.sessionId,
  );
  if (result.status === 'expired') return json({ error: 'expired' }, 410);
  return json(result);
}
