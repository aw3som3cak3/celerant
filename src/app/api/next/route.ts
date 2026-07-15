import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlayer } from '@/lib/auth';
import { nextItem } from '@/lib/practice';
import { rampLen, rampTargetP, playerTarget, reachUpProbability, RAMP_FLOOR_P } from '@/lib/onboarding';
import * as repo from '@/db/repo';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  playerId: z.string().min(1),
  sessionId: z.number().int().optional(),
  chosenCode: z.string().optional(),
});

// Returns { itemId, prompt, family, mode, level, novel }. The answer stays on
// the server. Peak-end (§3.3) is decided here: the last item of a session is the
// highest-p eligible skill.
export async function POST(req: NextRequest) {
  const now = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);

  const player = requirePlayer(req, parsed.data.playerId, now);
  if (!player) return json({ error: 'unauthorized' }, 401);

  // The honest success target for this player: 0.90 for a new/fragile child,
  // easing to 0.80 as his wins steady (start-from-below §4).
  const completed = repo.completedSessionCount(player.id);
  const maxVol = repo.maxVolatility(player.id);
  const baseTarget = playerTarget(completed, maxVol);

  // Reach-up (fix-reach-up.md §3): is this child demonstrably coasting, and if so
  // how firmly should we probe upward? The probability scales with the trivial
  // share, so an under-challenged kid climbs quickly; it is 0 for anyone not
  // coasting, so a struggling child is never touched by it. `coasting` also
  // suppresses the past-ramp retreat below — a coasting kid's occasional reach-up
  // miss must not drag his floor down (no cascade).
  const recentAcc = repo.recentOverallFirstTryAccuracy(player.id, 12);
  const trivialProp = repo.recentTrivialProportion(player.id, 12);
  // Pause reach-up only when genuinely stumbling — two misses in a row — not on a
  // single stray flub, so an acing kid keeps climbing. Two misses also arm the
  // retreat below (they're mutually exclusive with coasting), so no cascade.
  const reachUpProb = reachUpProbability(recentAcc, maxVol, trivialProp, repo.lastTwoMissed(player.id));
  const coasting = reachUpProb > 0;
  const reachUp = Math.random() < reachUpProb;

  let peakEnd = false;
  let warmupTarget: number | undefined;
  if (parsed.data.sessionId != null) {
    const run = repo.sessionRunById(parsed.data.sessionId);
    if (run && run.player_id === player.id && run.ended_at == null) {
      peakEnd = run.completed === run.target - 1;
      // Warm-up ramp (onboarding §2): while inside the ramp, climb from the easy
      // floor to the player's base target. And retreat (start-from-below §5): two
      // misses in a row means the floor was too high — drop back to easy ground.
      const ramp = rampLen(completed, run.target);
      if (run.completed < ramp) {
        warmupTarget = repo.lastTwoMissed(player.id) ? RAMP_FLOOR_P : rampTargetP(run.completed, ramp, baseTarget);
      } else if (repo.lastTwoMissed(player.id) && !coasting) {
        warmupTarget = RAMP_FLOOR_P; // retreat can fire past the ramp too, in a fragile first session — but not for a coasting kid whose misses are reach-up probes
      }
    }
  }

  // The child's session-start choice (§3.2), logged for §4.3 usage analysis.
  if (parsed.data.chosenCode) repo.appendUsageEvent(player.id, 'skill_chosen', parsed.data.chosenCode, now);

  return json(
    nextItem(player.id, player.school_year, now, {
      stretch: player.stretch === 1,
      chosenCode: parsed.data.chosenCode,
      peakEnd,
      warmupTarget,
      baseTarget,
      reachUp,
    }),
  );
}
