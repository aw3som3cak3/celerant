import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { BY_CODE } from '@/skills';
import { hashToken } from '@/lib/session';
import { fluencySignal } from '@/lib/fluency-signal';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The outward flytsignal (fluency-signal-contract.md v0.2). ONE child, ONE code, per call —
// there is deliberately no endpoint that takes a family and returns many children, and none
// that sorts by ability: a ranked list is impossible by construction, not by policy.
//
// Auth is a PER-CHILD read token (least privilege): `Authorization: Bearer <token>` resolves
// to exactly one child, and that token can read only that child. A leader assembling a view
// over twelve children does twelve single lookups with twelve tokens; a sibling without a
// token stays unreadable. `player.id` (a stable uuid) may be passed as ?player to be explicit
// — if present it must match the token's child.
export function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const playerId = token ? repo.playerIdForReadToken(hashToken(token)) : null;
  if (!playerId) return json({ error: 'unauthorized' }, 401);

  const requested = req.nextUrl.searchParams.get('player');
  if (requested && requested !== playerId) return json({ error: 'forbidden' }, 403); // a token reads only its own child

  const code = req.nextUrl.searchParams.get('code') ?? '';
  if (!BY_CODE.has(code)) return json({ error: 'unknown_code' }, 404);

  // 200 with confidence:'unknown' is a VALID answer (no measurement yet), not a request error.
  return json(fluencySignal(playerId, code));
}
