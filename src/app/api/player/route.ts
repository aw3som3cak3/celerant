import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { sessionFromRequest } from '@/lib/auth';
import { BY_KEY } from '@/icons';
import { enteringGradeHint, NO_GRADE_DEFAULT } from '@/lib/onboarding';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The child never declares a grade (start-from-below §3): the create flow sends
// only an icon. A grade is optional and, when a parent gives one, is a weak,
// date-corrected hint — it can never place the first problem above the easy floor.
const Body = z.object({ icon: z.string(), schoolYear: z.number().int().min(0).max(9).optional() });

export async function POST(req: NextRequest) {
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ error: 'unauthorized' }, 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const { icon } = parsed.data;

  if (!BY_KEY.has(icon)) return json({ error: 'bad_icon' }, 400);
  if (repo.iconsUsedInFamily(s.familyId).has(icon)) return json({ error: 'icon_taken' }, 409);

  // No grade given -> start from the low floor and let the climb do the work.
  const seedGrade = parsed.data.schoolYear != null ? enteringGradeHint(parsed.data.schoolYear, now) : NO_GRADE_DEFAULT;
  const id = repo.createPlayer(s.familyId, icon, seedGrade, now);
  return json({ ok: true, playerId: id });
}
