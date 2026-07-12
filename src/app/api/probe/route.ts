import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import * as repo from '@/db/repo';
import { probeItemsForClient, gradeProbe, PROBE_VERSION } from '@/lib/probes';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Which probe, if any, is due for this player (evidence-and-theses.md §2.3).
// Baseline is forced and runs before the first practice item; monthly and
// transfer are offered and skippable. The child is never told it's a probe — the
// items look like practice; only the routing and the destination table differ.
export function GET(req: NextRequest) {
  const now = Date.now();
  const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
  const player = requirePlayer(req, playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const respond = (set: string, forced: boolean, isBaseline: boolean) =>
    json({ due: isBaseline ? 'baseline' : forced ? set : set, set, forced, isBaseline, version: PROBE_VERSION, items: probeItemsForClient(set) });

  if (!repo.hasBaselineProbe(playerId)) return respond('arith_v1', true, true);
  if (repo.transferProbeDue(playerId, now)) return respond('transfer_v1', false, false);
  if (repo.monthlyProbeDue(playerId, now)) return respond('arith_v1', false, false);
  return json({ due: null });
}

const Body = z.object({
  playerId: z.string().min(1),
  probeSet: z.string().min(1),
  ref: z.string().min(1),
  given: z.string().max(20).nullable().optional(),
  latencyMs: z.number().int().min(0).max(1_000_000),
  isBaseline: z.boolean().optional(),
});

// Record one probe response. The item's answer never leaves the server (as with
// practice); we grade against the fixed set and write to `probe` — a table the
// model never reads. Quiet feedback only: the correctness, never the answer, so
// a fixed item is not taught and stays comparable across administrations.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  const graded = gradeProbe(parsed.data.probeSet, parsed.data.ref, parsed.data.given ?? null);
  if (!graded) return json({ error: 'unknown_item' }, 400);

  repo.appendProbe({
    playerId: player.id,
    probeSet: parsed.data.probeSet,
    itemRef: parsed.data.ref,
    featuresJson: JSON.stringify(graded.features),
    given: parsed.data.given ?? null,
    correct: graded.correct,
    latencyMs: parsed.data.latencyMs,
    at: now,
    isBaseline: parsed.data.isBaseline ?? false,
    probeVersion: PROBE_VERSION,
  });
  return json({ correct: graded.correct });
}
