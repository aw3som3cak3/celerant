import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { hashPin, isWeakPin, verifyPin } from '@/lib/session';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Change a family's entry PIN or parent PIN — self-serve recovery behind the
// parent session, so a forgotten entry PIN no longer means an SSH into the DB.
// The parent cookie already proves the parent PIN was entered this session, so
// re-verifying it here would be redundant. Same validation as create/activate:
// no weak PINs, and the two PINs must stay different.
const Body = z.object({ which: z.enum(['entry', 'parent']), pin: z.string().regex(/^\d{4}$/) });

export async function POST(req: NextRequest) {
  const now = Date.now();
  const familyId = parentFamilyFromRequest(req, now);
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const { which, pin } = parsed.data;
  if (isWeakPin(pin)) return json({ error: 'weak_pin' }, 400);

  const family = repo.familyById(familyId);
  if (!family) return json({ error: 'forbidden' }, 403);

  // The new PIN must not collide with the OTHER PIN (an entry PIN can't equal the
  // parent PIN, and vice versa) — otherwise entry and parent login would be
  // indistinguishable.
  const otherHash = which === 'entry' ? family.parent_hash : family.pin_hash;
  if (verifyPin(pin, otherHash)) return json({ error: 'pins_equal' }, 400);

  if (which === 'entry') repo.updateFamilyPin(familyId, hashPin(pin));
  else repo.updateFamilyParentPin(familyId, hashPin(pin));
  return json({ ok: true });
}
