import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { enteringGradeHint } from '@/lib/onboarding';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string(), schoolYear: z.number().int().min(0).max(9) });

// Change årskurs. NOT a naive re-seed: re-seed from the new year, then replay
// the whole ledger over it, so evidence is preserved (§6.1). Also the coarse
// "mitt barn ligger fel" correction now that placement is off the first path.
export async function POST(req: NextRequest) {
  const familyId = parentFamilyFromRequest(req, Date.now());
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  if (!repo.playerBelongsToFamily(parsed.data.playerId, familyId)) return json({ error: 'not_found' }, 404);

  // Date-correct the parent-named grade (start-from-below §3): before the late-
  // August turnover, "grade 3" means the child is entering it — seed from year 2.
  repo.updatePlayerYear(parsed.data.playerId, enteringGradeHint(parsed.data.schoolYear, Date.now()));
  return json({ ok: true });
}
