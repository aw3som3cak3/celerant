import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Recent attempts across the family, for "det var fel barn" (§6.2). Labels runs
// by icon; ids let the parent pick a range to reassign.
export function GET(req: NextRequest) {
  const familyId = parentFamilyFromRequest(req, Date.now());
  if (!familyId) return json({ error: 'forbidden' }, 403);
  return json({ attempts: repo.recentFamilyAttempts(familyId, 100) });
}
