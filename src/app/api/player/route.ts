import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { sessionFromRequest } from '@/lib/auth';
import { BY_KEY } from '@/icons';
import { NO_GRADE_DEFAULT } from '@/lib/onboarding';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Create a child. When a grade is given it is stored VERBATIM as the chosen grade
// (fix-grade-source-of-truth §1) — no offset here; the start-from-below minus-one
// is applied only at seeding time (seedGradeFor), so school_year is the source of
// truth in chosen grade. (Parent-only creation — §3 #2 — is deferred: it needs a
// parent-session handoff during onboarding, since the first child is created
// before any parent login exists.)
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

  const chosenGrade = parsed.data.schoolYear ?? NO_GRADE_DEFAULT;
  const id = repo.createPlayer(s.familyId, icon, chosenGrade, now);
  return json({ ok: true, playerId: id });
}
