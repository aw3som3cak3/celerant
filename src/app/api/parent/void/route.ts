import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string(), lo: z.number().int(), hi: z.number().int(), reason: z.string().max(200) });

// Tombstone an id range ("katten satt på tangentbordet") and replay (§5.3).
export async function POST(req: NextRequest) {
  const now = Date.now();
  const familyId = parentFamilyFromRequest(req, now);
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  if (!repo.playerBelongsToFamily(parsed.data.playerId, familyId)) return json({ error: 'not_found' }, 404);

  repo.voidRange(parsed.data.playerId, parsed.data.lo, parsed.data.hi, parsed.data.reason, now);
  return json({ ok: true });
}
