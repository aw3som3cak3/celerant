import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { sessionFromRequest, parentFamilyFromRequest } from '@/lib/auth';
import { buildLadder, buildAlerts, confirmBuildComplete, confirmCapability, korkortStatuses } from '@/lib/electronics';
import { CapabilityCode } from '@/lib/electronics-builds';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The BUILD-LADDER surface's data endpoint (docs/electronics-subject-plan.md §2b). A CONSUMER of the
// fluency signal that sits beside the engine — it never feeds the selector/θ/gate/ledger. Gated to
// the TEST FAMILY (fox+hotdog) for now, exactly like the demo/granska surfaces.
//
// Equipment capabilities an adult may confirm directly from the surface (the coin rung needs an
// owned breadboard). Voltage/soldering tiers are NOT here: those are climbed by completing a build,
// never hand-granted.
const CONFIRMABLE_EQUIPMENT: CapabilityCode[] = ['elec_cap_owns_breadboard'];

function isTestFamily(familyId: string): boolean {
  const family = repo.familyById(familyId);
  return !!family && family.icon_pair.includes('fox') && family.icon_pair.includes('hotdog');
}

// GET — the ladder for every child in the family, plus the grownup alerts (ready-to-pre-pack kits).
export function GET(req: NextRequest) {
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ authorized: false }, 401);
  if (!isTestFamily(s.familyId)) return json({ authorized: false });

  const players = repo.playersInFamily(s.familyId).map((p) => ({
    id: p.id,
    icon: p.icon,
    schoolYear: p.school_year,
    ladder: buildLadder(p.id).map((r) => ({
      buildId: r.build.id,
      name: r.build.name,
      tier: r.build.voltage_tier,
      status: r.status,
      skills: r.skills,
      skillsMet: r.skillsMet,
      equipment: r.equipment,
      equipmentOwned: r.equipmentOwned,
      tierUnlocked: r.tierUnlocked,
      kitBom: r.build.kit_bom,
      instructions: r.build.instructions.kid_adult,
    })),
    capabilities: repo.electronicsCapabilityRows(p.id),
    alerts: buildAlerts(p.id),
    // KÖRKORT (docs/electronics-korkort-flow.md): the three-state view a master reads when approving.
    // EARNED derives purely from the granted capability — approving a build (which grants the
    // elec_cap_tier_* capability) is what flips the körkort to 🎖️. No körkort-specific record.
    korkort: korkortStatuses(p.id),
  }));

  return json({ authorized: true, adult: parentFamilyFromRequest(req, now) === s.familyId, players });
}

// POST — the ONE write that crosses back (boundary §3), ADULT-confirmed: a build completion, or an
// equipment confirmation. Requires a parent-elevated session (the adult who supported the build), so
// a child left on the family session can never self-grant a durable capability.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const s = sessionFromRequest(req, now);
  if (!s) return json({ ok: false }, 401);
  if (!isTestFamily(s.familyId)) return json({ ok: false }, 403);
  if (parentFamilyFromRequest(req, now) !== s.familyId) return json({ ok: false, error: 'adult_required' }, 403);

  const body = (await req.json().catch(() => null)) as
    | { playerId?: string; action?: string; buildId?: string; capability?: string }
    | null;
  if (!body?.playerId || !repo.playerBelongsToFamily(body.playerId, s.familyId)) return json({ ok: false }, 400);

  if (body.action === 'complete_build') {
    if (!body.buildId) return json({ ok: false }, 400);
    const res = confirmBuildComplete(body.playerId, body.buildId, now);
    if (!res) return json({ ok: false, error: 'unknown_build' }, 404);
    return json({ ok: true, granted: res.granted });
  }

  if (body.action === 'confirm_equipment') {
    if (!body.capability || !CONFIRMABLE_EQUIPMENT.includes(body.capability as CapabilityCode)) {
      return json({ ok: false, error: 'unknown_capability' }, 400);
    }
    const wrote = confirmCapability(body.playerId, body.capability, now);
    return json({ ok: true, granted: wrote });
  }

  return json({ ok: false, error: 'unknown_action' }, 400);
}
