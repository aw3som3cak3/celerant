import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { probeItemsForClient, gradeProbe, PROBE_VERSION, PROBE_SETS } from '@/lib/probes';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The probe is a MEASUREMENT, and a child cannot meaningfully consent to one — so
// it is off the child's path entirely (fix-remove-probe.md §2). The mechanism is
// kept, but reachable ONLY behind the parent PIN: an adult who understands what it
// is may run a check knowingly. There is no child-facing UI for it (dormant).

// A parent fetches the items of a fixed set to administer a check deliberately.
export function GET(req: NextRequest) {
  const familyId = parentFamilyFromRequest(req, Date.now());
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
  if (!repo.playerBelongsToFamily(playerId, familyId)) return json({ error: 'not_found' }, 404);
  const set = req.nextUrl.searchParams.get('set') ?? 'arith_v1';
  if (!PROBE_SETS[set]) return json({ error: 'bad_set' }, 400);
  return json({ set, version: PROBE_VERSION, items: probeItemsForClient(set) });
}

const Body = z.object({
  playerId: z.string().min(1),
  probeSet: z.string().min(1),
  ref: z.string().min(1),
  given: z.string().max(20).nullable().optional(),
  latencyMs: z.number().int().min(0).max(1_000_000),
  isBaseline: z.boolean().optional(),
});

// Record one probe response — parent-gated. The item's answer never leaves the
// server; we grade against the fixed set and write to `probe`, which the model
// never reads.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const familyId = parentFamilyFromRequest(req, now);
  if (!familyId) return json({ error: 'forbidden' }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  if (!repo.playerBelongsToFamily(parsed.data.playerId, familyId)) return json({ error: 'not_found' }, 404);

  const graded = gradeProbe(parsed.data.probeSet, parsed.data.ref, parsed.data.given ?? null);
  if (!graded) return json({ error: 'unknown_item' }, 400);

  repo.appendProbe({
    playerId: parsed.data.playerId,
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
