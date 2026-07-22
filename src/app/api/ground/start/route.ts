import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import * as repo from '@/db/repo';
import { randomSeed } from '@/lib/rng';
import { RUN_STAGES, SPEED_ITEMS, type GroundStage } from '@/lib/ground';
import { speedRunStages, hasExploreSpeed } from '@/lib/ground-gate';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string().min(1), mode: z.enum(['ladder', 'speed']).optional() });

// Start a GROUND run. 'ladder' (default) climbs the acquisition rungs in order.
// 'speed' is a timed fluency round drawn ONLY from the rungs the child is already
// grounded (accurate) at — his own speed run. Both log 'ground_started' for the
// engagement + displacement watch (spec §4), never the ability replay.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const mode = parsed.data.mode ?? 'ladder';
  let items: { seed: number; stage: GroundStage }[];
  if (mode === 'speed') {
    const stages = speedRunStages(player.id) as GroundStage[];
    if (stages.length === 0) return json({ error: 'not_ready' }, 409); // nothing grounded to speed yet
    items = Array.from({ length: SPEED_ITEMS }, (_, i) => ({ seed: randomSeed(), stage: stages[i % stages.length] }));
  } else {
    items = RUN_STAGES.map((stage) => ({ seed: randomSeed(), stage }));
  }
  repo.appendUsageEvent(player.id, mode === 'speed' ? 'ground_speed_started' : 'ground_started', null, now);
  return json({ items, mode, speedReady: hasExploreSpeed(player.id) });
}
