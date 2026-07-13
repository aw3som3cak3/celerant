import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string(), schoolYear: z.number().int().min(0).max(9) });

// Change årskurs. Stores the CHOSEN grade verbatim (the source of truth,
// fix-grade-source-of-truth §1/§4) — NO offset here. updatePlayerYear re-seeds
// from the new chosen grade via seedGradeFor (the single minus-one) and replays
// the whole ledger over it, so evidence is preserved (§6.1). The parent view then
// shows exactly the grade they picked.
export async function POST(req: NextRequest) {
  const familyId = parentFamilyFromRequest(req, Date.now());
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  if (!repo.playerBelongsToFamily(parsed.data.playerId, familyId)) return json({ error: 'not_found' }, 404);

  repo.updatePlayerYear(parsed.data.playerId, parsed.data.schoolYear);
  return json({ ok: true });
}
