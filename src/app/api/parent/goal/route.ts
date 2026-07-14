import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The family goal (§4.1): cooperative, denominated in sessions, family-wide.
// The response carries ONE number — total completed sessions since the goal was
// set. No per-child contribution is stored or returned, ever.
export function GET(req: NextRequest) {
  const familyId = parentFamilyFromRequest(req, Date.now());
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const goal = repo.getGoal(familyId);
  const progress = goal ? repo.familyGoalProgress(familyId, goal.created_at) : 0;
  return json({ goal: goal ? { label: goal.label, target: goal.target, reached: goal.reached_at != null } : null, progress });
}

const Body = z.object({ label: z.string().min(1).max(60), target: z.number().int().min(1).max(1000) });

export async function POST(req: NextRequest) {
  const now = Date.now();
  const familyId = parentFamilyFromRequest(req, now);
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  repo.setGoal(familyId, parsed.data.label, parsed.data.target, now);
  return json({ ok: true });
}

export function DELETE(req: NextRequest) {
  const now = Date.now();
  const familyId = parentFamilyFromRequest(req, now);
  if (!familyId) return json({ error: 'forbidden' }, 403);
  repo.clearGoal(familyId, now);
  return json({ ok: true });
}
