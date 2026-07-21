import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import * as repo from '@/db/repo';
import { randomSeed } from '@/lib/rng';
import { GROUND_ITEMS } from '@/lib/ground';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string().min(1) });

// Start a GROUND run: issue scene seeds the client builds and animates. SHADOW mode —
// this only records structure-choices; it authorises nothing and gates nothing. The
// 'ground_started' usage event feeds the engagement + displacement watch (spec §4),
// never the ability replay.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const seeds = Array.from({ length: GROUND_ITEMS }, () => randomSeed());
  repo.appendUsageEvent(player.id, 'ground_started', null, now);
  return json({ seeds });
}
