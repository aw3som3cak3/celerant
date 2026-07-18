import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { sprintBatch } from '@/lib/sprint';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Start an interval-based sprint (input-timing A3): the server issues a batch of
// seeds for the single (eligible, sprintable) skill; the client builds each item
// locally, auto-submits, and measures a clean per-item interval. No prompts or
// answers cross the wire — only (seed, answerLength) per item.
const Body = z.object({ playerId: z.string().min(1), code: z.string().min(1) });

export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const batch = sprintBatch(player.id, parsed.data.code, now);
  if (!batch) return json({ error: 'not_eligible' }, 409);
  return json(batch);
}
