import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { replay } from '@/db/replay';
import { parentFamilyFromRequest } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string() });

// Drop and rebuild the ability cache. Idempotent (§5.4).
export async function POST(req: NextRequest) {
  const familyId = parentFamilyFromRequest(req, Date.now());
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  if (!repo.playerBelongsToFamily(parsed.data.playerId, familyId)) return json({ error: 'not_found' }, 404);

  replay(parsed.data.playerId);
  return json({ ok: true });
}
