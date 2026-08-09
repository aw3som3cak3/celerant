import { NextRequest } from 'next/server';
import { sessionFromRequest } from '@/lib/auth';
import * as repo from '@/db/repo';
import { BY_CODE } from '@/skills';
import { fluencySignal } from '@/lib/fluency-signal';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The outward flytsignal (fluency-signal-contract.md v0.1). ONE child, ONE code, per call —
// there is deliberately no endpoint that takes a family and returns many children, and none
// that sorts by ability: a ranked list is impossible by construction, not by policy.
//
// Auth for v0.1 is the existing family session (family-scoped) and the player must belong to
// it; a dedicated read-only token for a truly external holder is the noted hardening step.
export function GET(req: NextRequest) {
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ error: 'unauthorized' }, 401);

  const player = req.nextUrl.searchParams.get('player') ?? '';
  const code = req.nextUrl.searchParams.get('code') ?? '';
  if (!repo.playerBelongsToFamily(player, s.familyId)) return json({ error: 'forbidden' }, 403);
  if (!BY_CODE.has(code)) return json({ error: 'unknown_code' }, 404);

  // 200 with confidence:'unknown' is a VALID answer (no measurement yet), not a request error.
  return json(fluencySignal(player, code));
}
