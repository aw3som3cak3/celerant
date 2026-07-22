import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import * as repo from '@/db/repo';
import { randomSeed } from '@/lib/rng';
import { RUN_STAGES } from '@/lib/ground';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string().min(1) });

// Start a GROUND run: issue one {seed, stage} per rung of the acquisition ladder, in
// climbing order. The client builds and renders each from the seed. SHADOW mode —
// this only records choices; it authorises nothing and gates nothing. The
// 'ground_started' usage event feeds the engagement + displacement watch (spec §4),
// never the ability replay.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const items = RUN_STAGES.map((stage) => ({ seed: randomSeed(), stage }));
  repo.appendUsageEvent(player.id, 'ground_started', null, now);
  return json({ items });
}
