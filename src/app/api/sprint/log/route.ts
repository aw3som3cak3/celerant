import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { appendUsageEvent } from '@/db/repo';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The child's response to a victory-lap OFFER. 'offered' is logged when the card is
// shown (feeds the ~1-per-3-sessions throttle); 'declined' when they wave it off
// (keeps us from re-nagging that skill for a week). Motivational-layer only — the
// ability replay never reads usage_event, so none of this moves what's served.
const Body = z.object({
  playerId: z.string().min(1),
  event: z.enum(['offered', 'declined']),
  skill: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  appendUsageEvent(player.id, `sprint_${parsed.data.event}`, parsed.data.skill, now);
  return json({ ok: true });
}
