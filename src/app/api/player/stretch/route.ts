import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import * as repo from '@/db/repo';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string().min(1), on: z.boolean() });

// The child's own "svårare" toggle (§3.2): shifts the target to p = 0.65.
// Reversible, unannounced, unrewarded — no badge for using it, ever.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);
  repo.setStretch(player.id, parsed.data.on);
  return json({ ok: true });
}
