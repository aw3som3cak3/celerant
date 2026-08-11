import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The family goal (§4.1): cooperative, denominated in sessions, family-wide. Every response
// carries ONE aggregate number — never any per-child contribution. A family has one ACTIVE goal
// plus any CELEBRATED (reached, un-acknowledged) goals that linger until the parent presses Klar.
export function GET(req: NextRequest) {
  const familyId = parentFamilyFromRequest(req, Date.now());
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const goal = repo.getActiveGoal(familyId);
  const progress = goal ? repo.familyGoalProgress(familyId, goal.created_at, goal.carry_offset) : 0;
  return json({
    goal: goal ? { id: goal.id, label: goal.label, target: goal.target, reached: goal.reached_at != null, progress } : null,
    celebrated: repo.celebratedGoals(familyId).map((g) => ({ id: g.id, label: g.label, target: g.target })),
  });
}

// carryOver: when a new goal replaces an unfinished active one, keep its collected points as the
// new goal's starting balance (the parent's per-set choice).
const Body = z.object({ label: z.string().min(1).max(60), target: z.number().int().min(1).max(1000), carryOver: z.boolean().optional() });

export async function POST(req: NextRequest) {
  const now = Date.now();
  const familyId = parentFamilyFromRequest(req, now);
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const active = repo.getActiveGoal(familyId);
  const carry = parsed.data.carryOver && active ? repo.familyGoalProgress(familyId, active.created_at, active.carry_offset) : 0;
  repo.createGoal(familyId, parsed.data.label, parsed.data.target, now, carry);
  return json({ ok: true });
}

// Klar: acknowledge/archive one goal by id (a celebrated goal → done; an active goal → discarded).
export function DELETE(req: NextRequest) {
  const now = Date.now();
  const familyId = parentFamilyFromRequest(req, now);
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const id = Number(new URL(req.url).searchParams.get('id'));
  repo.acknowledgeGoal(familyId, Number.isFinite(id) && id > 0 ? id : null, now);
  return json({ ok: true });
}
