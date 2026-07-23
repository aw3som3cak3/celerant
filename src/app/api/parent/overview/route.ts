import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { SKILLS, skillDepth } from '@/skills';
import { aimFor } from '@/lib/fluency';
import { seedGradeFor } from '@/lib/onboarding';
import { buildStates } from '@/lib/practice';
import { computeUnlocked } from '@/lib/selector';
import { skillLabel } from '@/lib/labels';
import { displacement } from '@/lib/analysis';
import { calibrationReport, fatigueReport } from '@/lib/calibration';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const META = new Map(SKILLS.map((s) => [s.code, s]));

// Diagnostic thresholds (handoff §7). These FIRE, they do not display: the
// parent view lists a sentence only when a skill trips one, and shows nothing on
// a healthy child. A table of accuracy percentages is a report card no matter
// how it is framed — the parent reads 80% as a B−, and the system targets 80%.
const COLLAPSE_ACC = 0.5; // accuracy fell after unlock -> missing prerequisite
const COLLAPSE_MIN_N = 8;
const TRIVIAL_ACC = 0.98; // ~always right, θ unbounded -> year set too high
const TRIVIAL_MIN_N = 15;
const TRIVIAL_THETA = 3.0;

// Under-placed child (fix-reach-up.md §4): sustainedly acing everything AND being
// served mostly trivial items — reach-up should be pulling him up on its own, so
// this firing is also the audit on reach-up. One calm sentence; it never auto-acts.
const UNDERPLACED_ACC = 0.92; // recent first-try accuracy
const UNDERPLACED_TRIVIAL = 0.5; // recent share of trivial (p≥0.85) items
const UNDERPLACED_MIN_N = 30; // enough of a track record to be a pattern, not a good day

// Parent view (brief §8, ui-lifecycle §4.6). Parent-PIN gated. θ per skill as a
// plain table, no accuracy percentage, plus fired diagnostics. One player at a
// time; never a sibling join.
export function GET(req: NextRequest) {
  const now = Date.now();
  const familyId = parentFamilyFromRequest(req, now);
  if (!familyId) return json({ error: 'forbidden' }, 403);

  const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
  if (!repo.playerBelongsToFamily(playerId, familyId)) return json({ error: 'not_found' }, 404);
  const player = repo.playerById(playerId)!;

  const ability = repo.abilities(playerId);
  // Aim uses the SEED grade — the SAME grade the fluency layer gates milestones and
  // diplomas on (buildStates / fix-grade-source-of-truth §1). The old raw-school_year
  // aim here was a displayed number that disagreed with the one that awards the
  // diploma ("why 18/22 when she got it?"); this aligns them.
  const seedGrade = seedGradeFor(player.school_year);
  const toolRate = repo.latestToolRate(playerId);
  const unlocked = computeUnlocked(buildStates(playerId, player.school_year));

  const rows: { code: string; year: number; depth: number; theta: number; mode: string; rate: number | null; rateState: string; aim: number | null; touched: boolean; unlocked: boolean }[] = [];
  // Codes, not sentences — the client translates them (parent.diagCollapse /
  // parent.diagTrivial), so the diagnostic honours the chosen locale.
  const diagnostics: { code: 'collapse' | 'trivial' | 'underplaced'; skill: string }[] = [];

  for (const ab of ability.values()) {
    const meta = META.get(ab.skill_code);
    if (!meta) continue;
    rows.push({
      code: ab.skill_code,
      year: meta.year,
      depth: skillDepth(ab.skill_code),
      theta: ab.theta,
      mode: meta.mode,
      rate: ab.rate,
      rateState: ab.rate_state,
      aim: meta.mode === 'component' ? aimFor(toolRate, seedGrade, ab.skill_code) : null,
      // Seeded ≠ earned (bug-hunt-fluency.md §3/§4): a skill never served carries
      // only a cold-start seed. The client greys these so a parent reads an
      // untouched year-8 θ of -2.00 as "not practised", not "failed algebra".
      touched: ab.last_seen_at != null,
      unlocked: unlocked.get(ab.skill_code) ?? false,
    });

    const { acc, count } = repo.recentFirstTryAccuracy(playerId, ab.skill_code, 20);
    if (count >= COLLAPSE_MIN_N && acc < COLLAPSE_ACC) {
      diagnostics.push({ code: 'collapse', skill: skillLabel(ab.skill_code) });
    } else if (count >= TRIVIAL_MIN_N && acc >= TRIVIAL_ACC && ab.theta > TRIVIAL_THETA) {
      diagnostics.push({ code: 'trivial', skill: skillLabel(ab.skill_code) });
    }
  }

  // Child-level, not per-skill: is he acing everything AND still being served
  // mostly trivial items? If reach-up were keeping up he'd have climbed to his
  // edge and this would stay quiet — so it fires both as the manual escape hatch
  // (raise his year) and as the signal that reach-up isn't strong enough yet.
  if (
    repo.totalAttempts(playerId) >= UNDERPLACED_MIN_N &&
    repo.recentOverallFirstTryAccuracy(playerId, 20) >= UNDERPLACED_ACC &&
    repo.recentTrivialProportion(playerId, 20) >= UNDERPLACED_TRIVIAL
  ) {
    diagnostics.push({ code: 'underplaced', skill: '' });
  }

  // Curriculum order: year, then prerequisite depth within the year, then code as a
  // stable tiebreak. This is the profile chart's X axis.
  rows.sort((a, b) => a.year - b.year || a.depth - b.depth || a.code.localeCompare(b.code));

  return json({
    player: { id: player.id, icon: player.icon, schoolYear: player.school_year, sessionTarget: player.session_target, seedGrade },
    attemptsLast7Days: repo.attemptsLast7Days(playerId, now),
    // A plain number for the parent to notice, not to optimise (§3.6). No child
    // ever sees a count of sessions — enthusiasm shows for them as done maths.
    sessionsThisWeek: repo.sessionsThisWeek(playerId, now),
    // The transfer signal (evidence-and-theses §2.4): median latency on compounds
    // containing a component, before vs after that component crossed its fluency
    // aim. A drop is transfer — the cheapest real evidence, from the ledger.
    transfer: repo.applicationSignal(playerId),
    // The displacement safeguard (quasi-experimental §5): usage to keep LOW and
    // FLAT, with a calm ceiling alarm — never an engagement metric, no target.
    usage: displacement(playerId, now),
    diagnostics, // usually empty — an empty parent view is the normal one
    // The calibration monitor: predicted (~80% aim) vs observed first-try per skill,
    // and the fatigue curve. A permanent watchdog on the model's placement of THIS
    // child — the failure mode of a confident estimate is misplacement, and it lands
    // on the kid, not the dashboard.
    calibration: calibrationReport(playerId),
    fatigue: fatigueReport(playerId, player.session_target),
    skills: rows,
  });
}
