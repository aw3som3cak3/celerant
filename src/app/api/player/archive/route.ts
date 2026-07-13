import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string().min(1) });

// A parent removes a child. Parent-PIN gated. This is a soft delete (archived_at)
// — the child vanishes from the family grid, but their ledger is preserved and
// the row can be restored, so nothing is truly lost.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const familyId = parentFamilyFromRequest(req, now);
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  if (!repo.playerBelongsToFamily(parsed.data.playerId, familyId)) return json({ error: 'not_found' }, 404);

  repo.archivePlayer(parsed.data.playerId, now);
  return json({ ok: true });
}
