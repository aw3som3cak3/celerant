import { NextRequest } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import * as repo from '@/db/repo';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The ONLY write API Celerant accepts from the club (docs/club-bridge.md §2b). It provisions PENDING
// families + players from age + household grouping alone — it never receives names, emails, or any
// PII. Authenticated by a shared secret in CLUB_PROVISION_SECRET (Authorization: Bearer <secret>),
// compared in constant time. If the env var is unset, the endpoint refuses (503) rather than running
// unauthenticated.
const Body = z.object({
  groupName: z.string().min(1),
  households: z.array(
    z.object({
      children: z.array(z.object({ schoolYear: z.number() })),
    }),
  ),
  addExisting: z.array(z.object({ playerId: z.string() })).default([]),
});

// Constant-time bearer check. Returns configured:false when the secret env var is absent (→ 503).
function authorize(req: NextRequest): { configured: boolean; ok: boolean } {
  const secret = process.env.CLUB_PROVISION_SECRET;
  if (!secret) return { configured: false, ok: false };
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return { configured: true, ok };
}

export async function POST(req: NextRequest) {
  const gate = authorize(req);
  if (!gate.configured) return json({ error: 'not_configured' }, 503);
  if (!gate.ok) return json({ error: 'unauthorized' }, 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const { groupName, households, addExisting } = parsed.data;
  const now = Date.now();

  // Validate every existing player up front, before any writes — a bad id must not leave a
  // half-provisioned run behind.
  for (const e of addExisting) {
    if (!repo.playerById(e.playerId)) return json({ error: 'unknown_player', playerId: e.playerId }, 400);
  }

  // Ensure the named club group exists (find by kind+name, else create it).
  const groupId = repo.groupByKindName('club', groupName) ?? repo.createGroup('club', groupName, now);

  // Each household → one pending family; every new player joins the group. Aligned to input order.
  const householdsOut = households.map((h) => {
    const { familyId, activationToken, playerIds } = repo.provisionPendingFamily(
      h.children.map((c) => c.schoolYear),
      now,
    );
    for (const pid of playerIds) repo.addToGroup(groupId, pid, now);
    return { familyId, activationToken, players: playerIds };
  });

  // Already-Celerant players (e.g. Erik's own kids) → just group membership, no new family.
  const addedExisting: string[] = [];
  for (const e of addExisting) {
    repo.addToGroup(groupId, e.playerId, now);
    addedExisting.push(e.playerId);
  }

  return json({ groupId, households: householdsOut, addedExisting });
}
