import { NextRequest } from 'next/server';
import { requirePlayer } from '@/lib/auth';
import * as repo from '@/db/repo';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A resumable in-flight session, if one exists (#3). The client calls this on
// mount and continues an interrupted session — its completed items already bank
// toward the goal — instead of starting fresh and losing the progress. Only a
// still-open run started within the window, with items still to go, is offered.
const RESUME_WINDOW_MS = 6 * 3600 * 1000;

export function GET(req: NextRequest) {
  const now = Date.now();
  const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
  const player = requirePlayer(req, playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const open = repo.openSessionRun(player.id, now - RESUME_WINDOW_MS);
  // Only resume a session with real progress (≥1 answered) — an empty accidental
  // open is not a session to resume.
  const session = open && open.completed >= 1 && open.completed < open.target ? open : null;
  return json({ session });
}
