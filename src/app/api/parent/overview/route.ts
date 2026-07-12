import { NextRequest } from 'next/server';
import * as repo from '@/db/repo';
import { parentFamilyFromRequest } from '@/lib/auth';
import { SKILLS } from '@/skills';
import { aimFor } from '@/lib/fluency';
import { skillLabel } from '@/lib/labels';
import { displacement } from '@/lib/analysis';
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
  const aim = aimFor(repo.latestToolRate(playerId), player.school_year);

  const rows: { code: string; year: number; theta: number; mode: string; rate: number | null; rateState: string; aim: number | null }[] = [];
  // Codes, not sentences — the client translates them (parent.diagCollapse /
  // parent.diagTrivial), so the diagnostic honours the chosen locale.
  const diagnostics: { code: 'collapse' | 'trivial'; skill: string }[] = [];

  for (const ab of ability.values()) {
    const meta = META.get(ab.skill_code);
    if (!meta) continue;
    rows.push({
      code: ab.skill_code,
      year: meta.year,
      theta: ab.theta,
      mode: meta.mode,
      rate: ab.rate,
      rateState: ab.rate_state,
      aim: meta.mode === 'component' ? aim : null,
    });

    const { acc, count } = repo.recentFirstTryAccuracy(playerId, ab.skill_code, 20);
    if (count >= COLLAPSE_MIN_N && acc < COLLAPSE_ACC) {
      diagnostics.push({ code: 'collapse', skill: skillLabel(ab.skill_code) });
    } else if (count >= TRIVIAL_MIN_N && acc >= TRIVIAL_ACC && ab.theta > TRIVIAL_THETA) {
      diagnostics.push({ code: 'trivial', skill: skillLabel(ab.skill_code) });
    }
  }

  rows.sort((a, b) => a.year - b.year || a.code.localeCompare(b.code));

  return json({
    player: { id: player.id, icon: player.icon, schoolYear: player.school_year, sessionTarget: player.session_target },
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
    skills: rows,
  });
}
