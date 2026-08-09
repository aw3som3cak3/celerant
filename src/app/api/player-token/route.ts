import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { newSessionToken } from '@/lib/session';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ player: z.string().min(1) });

// Mint a per-child READ token (fluency-signal-contract v0.2). Guardian action: parent-PIN
// gated, and the player must be in the guardian's family. Returns the child's stable uuid
// (player.id) and a fresh secret token — shown ONCE, only its hash is stored. Hand {uuid,
// token} to the workshop: they store the uuid to map "our child ↔ Celerant", and use the
// token to read that ONE child's signal. A sibling without their own token stays unreadable.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const familyId = parentFamilyFromRequest(req, now);
  if (!familyId) return json({ error: 'forbidden' }, 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const { player } = parsed.data;
  if (!repo.playerBelongsToFamily(player, familyId)) return json({ error: 'not_found' }, 404);

  const { token, tokenHash } = newSessionToken();
  repo.createPlayerReadToken(tokenHash, player, now);
  return json({ uuid: player, token });
}
