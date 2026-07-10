import { NextRequest } from 'next/server';
import { requirePlayer } from '@/lib/auth';
import { eligibleSprintSkills } from '@/lib/sprint';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const now = Date.now();
  const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
  const player = requirePlayer(req, playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);
  return json({ skills: eligibleSprintSkills(player.id) });
}
