import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The whole ledger as JSON, parent PIN gated (§8.2). The difference between a
// home server and a hostage situation. Import is `sqlite3 < dump.sql`.
export function GET(req: NextRequest) {
  const familyId = parentFamilyFromRequest(req, Date.now());
  if (!familyId) return json({ error: 'forbidden' }, 403);
  return json(repo.exportFamily(familyId));
}
