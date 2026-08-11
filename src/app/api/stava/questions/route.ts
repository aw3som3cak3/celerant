import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { sessionFromRequest } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The flagged-question diagnostic lens (test family only, same gate as the granska tools). Returns
// the recent wrong/idk answers with the question rebuilt from its seed — ALL families, since this
// is Erik's tool for spotting broken generated items.
function isReviewer(req: NextRequest, now: number): boolean {
  const s = sessionFromRequest(req, now);
  if (!s) return false;
  const family = repo.familyById(s.familyId);
  return !!family && family.icon_pair.includes('fox') && family.icon_pair.includes('hotdog');
}

export function GET(req: NextRequest) {
  const now = Date.now();
  if (!isReviewer(req, now)) return json({ authorized: false });
  const since = now - 21 * 24 * 3600 * 1000; // last three weeks
  return json({ authorized: true, rows: repo.getQuestionLog(since, 1000) });
}
