import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { sessionChoices } from '@/lib/practice';
import * as repo from '@/db/repo';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string().min(1), again: z.boolean().optional() });

// Open a session and offer three eligible skills to start with (§3.2). The
// session length is the child's own target (default 20; shorter for young ones).
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const target = player.session_target;
  const sessionId = repo.createSessionRun(player.id, target, now);
  // §4.3: a plain session start, and 'en_till' when it followed a finished one
  // (the "en till?" button) — the signal for whether the child came back for more.
  repo.appendUsageEvent(player.id, 'session_started', null, now);
  if (parsed.data.again) repo.appendUsageEvent(player.id, 'en_till', null, now);
  const choices = sessionChoices(player.id, player.school_year, player.stretch === 1, now);
  return json({ sessionId, target, choices, stretch: player.stretch === 1 });
}
