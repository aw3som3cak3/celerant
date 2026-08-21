import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { hashPin } from '@/lib/session';
import { BY_KEY } from '@/icons';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PARENT ACTIVATION (docs/club-bridge.md §2c). PUBLIC by TOKEN: the one-time activation token IS the
// credential — there is no login, no session. A pending (club-imported) family is claimed here, its
// real PINs set and (optionally) its icons repicked, then it becomes an ordinary family the parent
// owns. A bad/spent/unknown token reveals NOTHING about any family.

// GET /api/activate?t=<rawToken> — the page's read: who are the kids, what are the current auto icons?
// Returns the family's icon pair + children for a live pending token; { ok:false } for anything else.
export function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') ?? '';
  if (!token) return json({ ok: false });
  const fam = repo.pendingFamilyByToken(token);
  if (!fam) return json({ ok: false });
  // Icons this child may NOT pick = taken within the family (excl self) ∪ taken by OTHER members of
  // any group the child is in (docs/groups.md §1) — so the picker hides both, and a repick can't
  // collide with a sibling OR another family in the STEAM-team.
  const familyIcons = repo.iconsUsedInFamily(fam.id);
  const children = repo.playersInFamily(fam.id).map((p) => ({
    playerId: p.id,
    icon: p.icon,
    schoolYear: p.school_year,
    exclude: [...new Set([...familyIcons, ...repo.groupIconsForPlayer(p.id)])].filter((k) => k !== p.icon),
  }));
  return json({ ok: true, iconPair: fam.icon_display || fam.icon_pair, children });
}

const Body = z.object({
  token: z.string().min(1),
  pin: z.string(),
  parentPin: z.string(),
  iconPair: z.tuple([z.string(), z.string()]).optional(),
  childIcons: z.array(z.object({ playerId: z.string(), icon: z.string() })).optional(),
});

const isPin = (s: string) => /^\d{4,8}$/.test(s);
const realIcon = (k: string) => BY_KEY.has(k);

// POST /api/activate — claim the family. Upstream validation here (PIN format, PINs-differ, icon keys
// real+distinct); the DB-dependent checks + the atomic write live in repo.activateFamilyTx.
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: 'bad_request' }, 400);
  const { token, pin, parentPin, iconPair, childIcons } = parsed.data;

  // PINs: 4–8 digits, and the child (entry) PIN must differ from the parent PIN.
  if (!isPin(pin) || !isPin(parentPin)) return json({ ok: false, error: 'bad_pin' }, 400);
  if (pin === parentPin) return json({ ok: false, error: 'pins_equal' }, 400);

  // Family icon pair (if changed): two DISTINCT real icons. Canonical-uniqueness is checked in the tx.
  if (iconPair) {
    const [a, b] = iconPair;
    if (!realIcon(a) || !realIcon(b) || a === b) return json({ ok: false, error: 'bad_icon' }, 400);
  }
  // Child icons (if changed): each a real icon. Belongs-to-family + within-family distinctness: the tx.
  if (childIcons && childIcons.some((c) => !realIcon(c.icon))) {
    return json({ ok: false, error: 'bad_icon' }, 400);
  }

  const result = repo.activateFamilyTx({
    rawToken: token,
    pinHash: hashPin(pin),
    parentHash: hashPin(parentPin),
    now: Date.now(),
    iconPair: iconPair ? `${iconPair[0]}+${iconPair[1]}` : undefined,
    childIcons,
  });

  if (result.ok) return json({ ok: true });
  // A spent/unknown token is 410 Gone (the link is used up or invalid) — the same answer for every bad
  // token, revealing no family. A pair/icon clash is a 409 the parent can fix by repicking.
  if (result.error === 'invalid_token') return json({ ok: false, error: 'invalid_token' }, 410);
  return json({ ok: false, error: result.error }, 409);
}
