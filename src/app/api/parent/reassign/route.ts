import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ lo: z.number().int(), hi: z.number().int(), fromPlayer: z.string(), toPlayer: z.string() });

// "Det var fel barn" — change ownership of an id range, never content, then
// replay both children (§6.2).
export async function POST(req: NextRequest) {
  const familyId = parentFamilyFromRequest(req, Date.now());
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const { lo, hi, fromPlayer, toPlayer } = parsed.data;

  if (!repo.playerBelongsToFamily(fromPlayer, familyId) || !repo.playerBelongsToFamily(toPlayer, familyId)) {
    return json({ error: 'not_found' }, 404);
  }
  repo.reassignAttempts(lo, hi, fromPlayer, toPlayer);
  return json({ ok: true });
}
