import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import * as repo from '@/db/repo';
import { buildGroundItem, gradeGround, conceptKey, classifyExplore } from '@/lib/ground';
import { exploreAim } from '@/lib/ground-gate';
import { intervalRate } from '@/lib/rate';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  playerId: z.string().min(1),
  results: z
    .array(
      z.object({
        seed: z.number().int(),
        stage: z.enum(['structure', 'count', 'numeral', 'sum', 'produce']),
        chosen: z.union([z.string().max(16), z.number().int()]),
        intervalMs: z.number().min(0),
      }),
    )
    .min(1)
    .max(64),
});

// Finish a SPEED run: grade every timed choice from its seed, record the events, and
// state a fluency rate (correct × 60000 / summed valid intervals — the same interval
// rate the numpad sprints use). Gentle outcome only: 'fast' (celebrated) or
// 'keep_going'. Shadow: records into ground_event, gates nothing.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const timings = parsed.data.results.map((r) => {
    const item = buildGroundItem(r.seed, r.stage);
    const correct = gradeGround(r.seed, r.stage, r.chosen);
    repo.appendGroundEvent(player.id, conceptKey(item), JSON.stringify(item), String(r.chosen), correct, now, r.intervalMs);
    return { correct, intervalMs: r.intervalMs };
  });

  const correct = timings.filter((t) => t.correct).length;
  const rate = intervalRate(timings) ?? 0; // correct/min over valid intervals
  const aim = exploreAim(player.id); // anchored to the child's own tap speed
  const outcome = classifyExplore(correct, timings.length, rate, aim);
  repo.appendUsageEvent(player.id, 'ground_speed_done', outcome === 'fast' ? 'fast' : null, now);

  return json({ correct, total: timings.length, correctPerMin: rate, aim, outcome });
}
