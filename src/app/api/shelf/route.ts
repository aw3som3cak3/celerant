import { NextRequest } from 'next/server';
import { requirePlayer } from '@/lib/auth';
import * as repo from '@/db/repo';
import { skillLabel } from '@/lib/labels';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The child's card shelf (§3.4): the first problem of each kind they ever
// solved, their own answer, the date. No titles, no ratings, no hierarchy. It
// belongs to the child, like the celeration chart — the parent view never sees
// it.
export function GET(req: NextRequest) {
  const now = Date.now();
  const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
  const player = requirePlayer(req, playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);
  return json({
    cards: repo.cardsForPlayer(player.id).map((c) => ({
      label: skillLabel(c.skillCode),
      prompt: c.prompt,
      given: c.given,
      earnedAt: c.earnedAt,
    })),
  });
}
