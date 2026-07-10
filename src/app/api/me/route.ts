import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { sessionFromRequest, parentFamilyFromRequest } from '@/lib/auth';
import { familyIcons } from '@/icons';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Session state for the client: the family's two icons, its players (icon +
// årskurs), and whether a parent session is currently elevated. No names.
export function GET(req: NextRequest) {
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ authenticated: false });
  const family = repo.familyById(s.familyId)!;
  const [a, b] = familyIcons(family.icon_pair);
  return json({
    authenticated: true,
    parent: parentFamilyFromRequest(req, now) === s.familyId,
    icons: [a.glyph, b.glyph],
    players: repo.playersInFamily(s.familyId).map((p) => ({ id: p.id, icon: p.icon, schoolYear: p.school_year })),
  });
}
