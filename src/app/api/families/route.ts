import * as repo from '@/db/repo';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The login grid lists icon pairs. Never player counts (ui-lifecycle §5.1).
// Rate-limited implicitly by being a home server; no names ever appear.
export function GET() {
  const pairs = repo.listFamilyIconPairs();
  return json({ pairs, empty: pairs.length === 0 });
}
