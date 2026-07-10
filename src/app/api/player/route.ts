import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { sessionFromRequest } from '@/lib/auth';
import { BY_KEY } from '@/icons';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ icon: z.string(), schoolYear: z.number().int().min(0).max(9) });

// Create a player: one icon (unused in this family) + årskurs (F=0..9). Seeds
// the ability cache from the year (§4.3). Then straight to the first problem.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ error: 'unauthorized' }, 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const { icon, schoolYear } = parsed.data;

  if (!BY_KEY.has(icon)) return json({ error: 'bad_icon' }, 400);
  if (repo.iconsUsedInFamily(s.familyId).has(icon)) return json({ error: 'icon_taken' }, 409);

  const id = repo.createPlayer(s.familyId, icon, schoolYear, now);
  return json({ ok: true, playerId: id });
}
