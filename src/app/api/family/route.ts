import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { BY_KEY } from '@/icons';
import { hashPin, isWeakPin, newSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/session';
import { json, setCookie } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  iconA: z.string(),
  iconB: z.string(),
  pin: z.string().regex(/^\d{4}$/),
  parentPin: z.string().regex(/^\d{4}$/),
});

// Create a family: an unordered icon pair + entry PIN + parent PIN (§4.2).
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const { iconA, iconB, pin, parentPin } = parsed.data;

  if (!BY_KEY.has(iconA) || !BY_KEY.has(iconB) || iconA === iconB) return json({ error: 'bad_pair' }, 400);
  if (isWeakPin(pin) || isWeakPin(parentPin)) return json({ error: 'weak_pin' }, 400);
  if (pin === parentPin) return json({ error: 'pins_equal' }, 400);

  if (repo.familyByIcons(iconA, iconB)) return json({ error: 'pair_taken' }, 409);

  const pair = `${iconA}+${iconB}`; // stored in the order entered, for display
  const familyId = repo.createFamily(pair, hashPin(pin), hashPin(parentPin), now);

  // Log the family in (entry session) so create-player can follow immediately.
  const { token, tokenHash } = newSessionToken();
  repo.createSession(tokenHash, familyId, false, now, now + SESSION_MAX_AGE_MS);
  const res = json({ ok: true, familyId, iconPair: pair });
  return setCookie(res, SESSION_COOKIE, token, SESSION_MAX_AGE_MS);
}
