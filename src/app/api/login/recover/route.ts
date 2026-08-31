import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { verifyPin, hashPin, isWeakPin } from '@/lib/session';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Recover a forgotten ENTRY PIN from the login screen — the one reset reachable
// while locked out, since the parent-settings screen sits *behind* the entry PIN.
// The parent PIN is the recovery credential: prove it, then set a new entry PIN.
// A pending (imported) family has a colon-free 'PENDING' parent_hash, so verifyPin
// always fails for it — it can only ever be claimed via its activation token, never here.

// In-memory throttle, keyed by the (canonical) icon pair. The app runs as a single
// Fly machine, so a module-level map is a fine, dependency-free limiter: it caps
// parent-PIN guessing at MAX tries per WINDOW. Cleared on a successful reset.
const WINDOW_MS = 10 * 60 * 1000;
const MAX = 5;
const attempts = new Map<string, { n: number; first: number }>();
function hit(key: string, now: number): number {
  const rec = attempts.get(key);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(key, { n: 1, first: now });
    return 1;
  }
  rec.n += 1;
  return rec.n;
}

const Body = z.object({
  iconPair: z.string(),
  parentPin: z.string().regex(/^\d{4}$/),
  newPin: z.string().regex(/^\d{4}$/),
});

export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);

  const { iconPair, parentPin, newPin } = parsed.data;
  const [a, b] = iconPair.split('+');
  if (!a || !b) return json({ error: 'invalid' }, 401);

  const key = [a, b].sort().join('+'); // stable regardless of entered order
  if (hit(key, now) > MAX) return json({ error: 'rate_limited' }, 429);

  // Uniform failure for a wrong pair OR a wrong parent PIN — never reveal which,
  // and do no family-state-revealing work before this check passes.
  const family = repo.familyByIcons(a, b);
  if (!family || !verifyPin(parentPin, family.parent_hash)) return json({ error: 'invalid' }, 401);

  // Same rules as create/activate/change: no weak PIN, and entry ≠ parent.
  if (isWeakPin(newPin)) return json({ error: 'weak_pin' }, 400);
  if (verifyPin(newPin, family.parent_hash)) return json({ error: 'pins_equal' }, 400);

  repo.updateFamilyPin(family.id, hashPin(newPin));
  attempts.delete(key); // a good reset clears the throttle
  return json({ ok: true });
}
