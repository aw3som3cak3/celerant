import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { sessionFromRequest } from '@/lib/auth';
import { verifyPin, newSessionToken, hashToken } from '@/lib/session';
import { json, setCookie, clearCookie, PARENT_COOKIE, PARENT_MAX_AGE_MS } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ parentPin: z.string().regex(/^\d{4}$/) });

// Elevate the current family session to a short-lived parent session in a
// separate cookie (§4.4), verified against the family's parent PIN.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ error: 'unauthorized' }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);

  const family = repo.familyById(s.familyId)!;
  if (!verifyPin(parsed.data.parentPin, family.parent_hash)) return json({ error: 'invalid' }, 401);

  const { token, tokenHash } = newSessionToken();
  repo.createSession(tokenHash, s.familyId, true, now, now + PARENT_MAX_AGE_MS);
  const res = json({ ok: true });
  return setCookie(res, PARENT_COOKIE, token, PARENT_MAX_AGE_MS);
}

// End the parent session.
export function DELETE(req: NextRequest) {
  const tok = req.cookies.get(PARENT_COOKIE)?.value;
  if (tok) repo.deleteSession(hashToken(tok));
  return clearCookie(json({ ok: true }), PARENT_COOKIE);
}
