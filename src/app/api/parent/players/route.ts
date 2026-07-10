import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const familyId = parentFamilyFromRequest(req, Date.now());
  if (!familyId) return json({ error: 'forbidden' }, 403);
  return json({
    players: repo
      .playersInFamily(familyId, true)
      .map((p) => ({ id: p.id, icon: p.icon, schoolYear: p.school_year, archived: p.archived_at != null })),
  });
}
