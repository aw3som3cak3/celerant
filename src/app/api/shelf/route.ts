import { NextRequest } from 'next/server';
import { requirePlayer } from '@/lib/auth';
import * as repo from '@/db/repo';
import { skillEligibility } from '@/lib/sprint';
import { skillLabel } from '@/lib/labels';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The child's DIPLOMA wall: one plaque per skill they've made FLUENT — a measured
// speed-run rate that crossed the aim (the 'fluent' band). Only what they've
// actually earned, nothing to compare against a sibling. Plus their own private
// last-7-days record. Belongs to the child; the parent view never sees it.
export function GET(req: NextRequest) {
  const now = Date.now();
  const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
  const player = requirePlayer(req, playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);
  const diplomas = skillEligibility(player.id)
    .filter((e) => e.band === 'fluent')
    .map((e) => ({ code: e.code, label: skillLabel(e.code), family: e.family }));
  return json({ days: repo.sessionDaysLast7(player.id, now), diplomas });
}
