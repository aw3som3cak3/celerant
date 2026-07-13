import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { requirePlayer } from '@/lib/auth';
import { BY_KEY } from '@/icons';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ playerId: z.string().min(1), icon: z.string() });

// A child changes their own icon. Family-session gated (the player must belong to
// the session's family). Icon must be a known key and not already taken by a
// sibling. Icon is identity, not evidence — no replay.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const { icon } = parsed.data;
  if (!BY_KEY.has(icon)) return json({ error: 'bad_icon' }, 400);
  if (icon !== player.icon && repo.iconsUsedInFamily(player.family_id).has(icon)) {
    return json({ error: 'icon_taken' }, 409);
  }
  repo.updatePlayerIcon(player.id, icon);
  return json({ ok: true });
}
