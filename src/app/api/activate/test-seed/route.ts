import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { sessionFromRequest } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A THROWAWAY pending family so Erik can walk the real activation flow repeatedly without a live club
// import (docs/club-bridge.md §3). Gated to the TEST FAMILY only — the same authorization the granska
// tools / demos use (the fox+hotdog family reported `authorized` by /api/stava/image-review).
const TEST_KEY = 'test_pending_family';

function isTestFamily(req: NextRequest, now: number): boolean {
  const s = sessionFromRequest(req, now);
  if (!s) return false;
  const family = repo.familyById(s.familyId);
  return !!family && family.icon_pair.includes('fox') && family.icon_pair.includes('hotdog');
}

export async function POST(req: NextRequest) {
  const now = Date.now();
  if (!isTestFamily(req, now)) return json({ ok: false }, 403);

  // Clean up the PREVIOUS throwaway family — but ONLY if it is still pending. If Erik actually walked
  // the flow it is now activated (a "real" family); we must never delete an activation, so we leave it.
  const prev = repo.getMeta(TEST_KEY);
  if (prev && repo.isFamilyPending(prev)) repo.hardDeleteFamily(prev);

  // Two fake kids, åk2 + åk4.
  const { familyId, activationToken } = repo.provisionPendingFamily([2, 4], now);
  repo.setMeta(TEST_KEY, familyId);

  return json({ activationUrl: `/aktivera?t=${activationToken}`, familyId });
}
