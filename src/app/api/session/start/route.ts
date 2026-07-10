import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { sessionChoices } from '@/lib/practice';
import * as repo from '@/db/repo';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSION_ITEMS = 20; // twenty items, not ten minutes (§3.1)
const Body = z.object({ playerId: z.string().min(1) });

// Open a session and offer three eligible skills to start with (§3.2).
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const sessionId = repo.createSessionRun(player.id, SESSION_ITEMS, now);
  const choices = sessionChoices(player.id, player.school_year, player.stretch === 1, now);
  return json({ sessionId, target: SESSION_ITEMS, choices, stretch: player.stretch === 1 });
}
