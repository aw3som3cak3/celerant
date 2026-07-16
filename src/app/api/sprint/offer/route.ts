import { NextRequest } from 'next/server';
import { requirePlayer } from '@/lib/auth';
import { sprintOffer } from '@/lib/sprint';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// At most one victory-lap skill to offer on the done screen, throttled to stay
// rare. Read-only: it never logs — the client logs 'sprint_offered' via /log only
// when it actually shows the card, so the throttle reflects real offers.
export function GET(req: NextRequest) {
  const now = Date.now();
  const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
  const player = requirePlayer(req, playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);
  return json({ offer: sprintOffer(player.id, now) });
}
