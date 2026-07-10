import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string(), target: z.number().int().min(4).max(30) });

// Set the child's session length (parent-gated). A setting, not evidence — it
// changes only how many items future sessions ask for, so a young child can
// finish (and earn the day) in six rather than twenty.
export async function POST(req: NextRequest) {
  const familyId = parentFamilyFromRequest(req, Date.now());
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  if (!repo.playerBelongsToFamily(parsed.data.playerId, familyId)) return json({ error: 'not_found' }, 404);

  repo.setSessionTarget(parsed.data.playerId, parsed.data.target);
  return json({ ok: true });
}
