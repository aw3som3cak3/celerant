import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { sessionChoices } from '@/lib/practice';
import { rampLen } from '@/lib/onboarding';
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
  // 'session_started' is logged on the FIRST answered item (advanceSession), not
  // here — a session with no answered question doesn't count as started (a wrong
  // icon + "tillbaka"). 'en_till' (the "en till?" button) still marks a return.
  if (parsed.data.again) repo.appendUsageEvent(player.id, 'en_till', null, now);
  const choices = sessionChoices(player.id, player.school_year, player.stretch === 1, now);
  // Warm-up ramp length for this session (onboarding-ramp §3): the client skips
  // the chooser and goes straight into the gentle opener while it is > 0.
  const ramp = rampLen(repo.completedSessionCount(player.id), target);
  return json({ sessionId, target, choices, stretch: player.stretch === 1, rampLen: ramp });
}
