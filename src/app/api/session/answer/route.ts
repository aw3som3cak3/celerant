import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { sessionAnswer } from '@/lib/practice';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The client-generated answer path (input-timing A1). Carries the CLIENT-measured
// interval (server stores it verbatim — the network is never in the measured path),
// a client-tracked try count, and an idempotency key. Grades authoritatively by
// re-generating from the seed; records-THEN-selects so the unchanged selector
// reacts to this answer; returns the next (code, seed) folded into the response.
const Body = z.object({
  playerId: z.string().min(1),
  sessionId: z.number().int().optional(),
  code: z.string().min(1),
  seed: z.number().int(),
  given: z.string().max(20).nullable().optional(),
  idk: z.boolean().optional(),
  tries: z.number().int().min(1).max(2),
  warmup: z.boolean().optional(),
  intervalMs: z.number().int().min(0).max(24 * 3600 * 1000),
  idemKey: z.string().min(1).max(80),
});

export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const d = parsed.data;
  const result = sessionAnswer(
    player,
    d.sessionId,
    d.code,
    d.seed,
    d.given ?? null,
    d.idk ?? false,
    d.tries,
    d.warmup ?? false,
    d.intervalMs,
    d.idemKey,
    now,
  );
  return json(result);
}
