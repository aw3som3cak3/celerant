import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { ingestSprint } from '@/lib/sprint';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ingest a completed interval-based sprint (input-timing A2). Idempotent on
// sprintKey. Carries each item's CLIENT-measured interval; the server re-grades
// from the seeds and re-bases the rate onto those intervals, then runs the
// unchanged Phase B outcome/reward (milestone bonus / demote).
const Body = z.object({
  playerId: z.string().min(1),
  code: z.string().min(1),
  sprintKey: z.string().min(1).max(80),
  results: z
    .array(
      z.object({
        seed: z.number().int(),
        given: z.string().max(20),
        intervalMs: z.number().int().min(0).max(24 * 3600 * 1000),
      }),
    )
    .min(1)
    .max(200),
});

export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const d = parsed.data;
  return json(ingestSprint(player.id, d.code, d.sprintKey, d.results, now));
}
