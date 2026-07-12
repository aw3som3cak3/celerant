import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { verifyPin, newSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/session';
import { json, setCookie } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ iconPair: z.string(), pin: z.string().regex(/^\d{4}$/) });

// Family entry: pick the two icons, type the entry PIN. Grants a family session
// (parent = false). The player is chosen after, on the player grid.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);

  const [a, b] = parsed.data.iconPair.split('+');
  const family = a && b ? repo.familyByIcons(a, b) : undefined;
  if (!family || !verifyPin(parsed.data.pin, family.pin_hash)) return json({ error: 'invalid' }, 401);

  const { token, tokenHash } = newSessionToken();
  repo.createSession(tokenHash, family.id, false, now, now + SESSION_MAX_AGE_MS);
  // Return the family's entered-order pair so the client caches it for quick
  // login in the order it was created (identity is the canonical icon_pair).
  const res = json({ ok: true, familyId: family.id, iconPair: family.icon_display || family.icon_pair });
  return setCookie(res, SESSION_COOKIE, token, SESSION_MAX_AGE_MS);
}
