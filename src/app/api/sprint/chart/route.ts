import { NextRequest } from 'next/server';
import { requirePlayer } from '@/lib/auth';
import { chartForSkill } from '@/lib/sprint';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The chart belongs to the child. Never appears in the parent view (addendum §5).
export function GET(req: NextRequest) {
  const now = Date.now();
  const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
  const code = req.nextUrl.searchParams.get('code');
  const player = requirePlayer(req, playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);
  if (!code) return json({ error: 'bad_request' }, 400);
  return json(chartForSkill(player.id, code));
}
