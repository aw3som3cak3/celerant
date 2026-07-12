import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { nextItem } from '@/lib/practice';
import * as repo from '@/db/repo';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  playerId: z.string().min(1),
  sessionId: z.number().int().optional(),
  chosenCode: z.string().optional(),
});

// Returns { itemId, prompt, family, mode, level, novel }. The answer stays on
// the server. Peak-end (§3.3) is decided here: the last item of a session is the
// highest-p eligible skill.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);

  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  let peakEnd = false;
  if (parsed.data.sessionId != null) {
    const run = repo.sessionRunById(parsed.data.sessionId);
    if (run && run.player_id === player.id && run.ended_at == null) peakEnd = run.completed === run.target - 1;
  }

  // The child's session-start choice (§3.2), logged for §4.3 usage analysis.
  if (parsed.data.chosenCode) repo.appendUsageEvent(player.id, 'skill_chosen', parsed.data.chosenCode, now);

  return json(
    nextItem(player.id, player.school_year, now, {
      stretch: player.stretch === 1,
      chosenCode: parsed.data.chosenCode,
      peakEnd,
    }),
  );
}
