import 'server-only';
import * as repo from '@/db/repo';
import { SKILLS } from '@/skills';
import { buildStates } from './practice';
import { computeUnlocked } from './selector';
import { SPRINT_ACCURACY_GATE, SPRINT_ACCURACY_WINDOW } from './fluency';
import { skillLabel } from './labels';

// --- The sprint ELIGIBILITY subsystem ---------------------------------------
// Answers, for one child right now: "which skills are in the fluency-building band
// — reliably ACCURATE but not yet demonstrated fast — and should a sprint be
// offered?" Availability is DERIVED from this, never a fixed cadence: a child
// churning new skills has many eligible; one who is all-fluent or all-struggling
// has none, and simply gets no offer. That is the intended self-regulation.
//
// The band (derived, not stored):
//   ground   — not yet reliably accurate (or cooling down after a collapsed
//              sprint): timing this would drill frustration. Not eligible.
//   building — accurate AND not yet demonstrated fluent (no MEASURED rate ≥ aim):
//              the fluency-building band. THE eligible state.
//   fluent   — a MEASURED sprint rate has crossed the aim: nothing to build.
//              Not eligible. (A provisional/seeded rate ≥ aim does NOT count —
//              seeded ≠ earned; the child must demonstrate it, which is exactly
//              what makes the milestone one-time.)

const SKILL_META = new Map(SKILLS.map((s) => [s.code, s]));

export type SprintBand = 'ground' | 'building' | 'fluent';
export type SprintEligibility = {
  code: string;
  family: string;
  band: SprintBand;
  accuracy: number; // recent first-try accuracy over the (post-demotion) window
  rate: number | null; // MEASURED rate if any, else null (provisional is not shown as earned)
  aim: number;
};

// Classify every sprintable, unlocked component for a child. Non-sprintable skills
// (compounds; multi-column written algorithms) are never in this list — a clock
// never belongs on them (Skill.sprintable).
export function skillEligibility(playerId: string): SprintEligibility[] {
  const player = repo.playerById(playerId);
  if (!player) return [];
  const states = buildStates(playerId, player.school_year);
  const unlocked = computeUnlocked(states);
  const ability = repo.abilities(playerId);

  const out: SprintEligibility[] = [];
  for (const s of states) {
    const meta = SKILL_META.get(s.code);
    if (!meta?.sprintable || !unlocked.get(s.code)) continue; // clocks only on unlocked tool skills
    const aim = s.aim ?? 0;
    const ab = ability.get(s.code);
    const measuredRate = ab?.rate_state === 'measured' && ab.rate != null ? ab.rate : null;
    const measuredFluent = measuredRate != null && measuredRate >= aim;

    // Accuracy over attempts SINCE the last collapse-demotion (0 ⇒ whole history),
    // so a demoted skill must re-solidify on fresh untimed practice before it can
    // be sprinted again — a state-based cooldown, never a timer, never a nag.
    const since = repo.lastSprintDemotionAt(playerId, s.code);
    const { acc, count } = repo.recentFirstTryAccuracySince(playerId, s.code, SPRINT_ACCURACY_WINDOW, since);
    const accurate = count >= SPRINT_ACCURACY_WINDOW && acc >= SPRINT_ACCURACY_GATE;

    const band: SprintBand = measuredFluent ? 'fluent' : accurate ? 'building' : 'ground';
    out.push({ code: s.code, family: s.family, band, accuracy: acc, rate: measuredRate, aim });
  }
  return out;
}

// The eligible skills: exactly the fluency-building band.
export function eligibleSprintSkills(playerId: string): SprintEligibility[] {
  return skillEligibility(playerId).filter((e) => e.band === 'building');
}

// Is a specific skill sprint-eligible for this child right now? The gate startSprint
// and the entry points share, so the offer and the run agree.
export function isSprintEligible(playerId: string, code: string): boolean {
  return eligibleSprintSkills(playerId).some((e) => e.code === code);
}

// Does this child have ANY eligible skill? Drives the icon-tap ⚡ affordance.
export function hasSprintAvailable(playerId: string): boolean {
  return eligibleSprintSkills(playerId).length > 0;
}

// Does this child have ANY diploma yet (a skill made fluent by crossing a speed-run
// aim)? Gates the diploma-room links: the room isn't shown until it has something in
// it — a first diploma is the reward for a first crossing.
export function hasDiplomas(playerId: string): boolean {
  return skillEligibility(playerId).some((e) => e.band === 'fluent');
}

// --- The end-of-session offer -----------------------------------------------
// A sprint is a VICTORY LAP offered at the peak moment (the just-finished done
// screen), never a gate, never forced. NO hardcoded cadence: availability is the
// eligibility above. The ONLY courtesy throttle is anti-nag — a skill the child
// waved off is not re-offered for a week (per skill, so other eligible skills are
// still offered; sprint availability is never starved).
const OFFER_DECLINE_COOLDOWN_MS = 7 * 24 * 3600 * 1000;
const OFFER_SESSION_WINDOW = 15; // "practised this session" ≈ the last N attempts

export type SprintOffer = { code: string; label: string; family: string };

export function sprintOffer(playerId: string, now: number): SprintOffer | null {
  const elig = eligibleSprintSkills(playerId);
  if (!elig.length) return null;

  // Offer a skill the child JUST practised well (the peak moment), never one they
  // recently waved off. Highest accuracy wins — the surest victory lap.
  const justPractised = new Set(repo.recentAttemptSkillCodes(playerId, OFFER_SESSION_WINDOW));
  const declined = new Set(repo.usageDetailsSince(playerId, 'sprint_declined', now - OFFER_DECLINE_COOLDOWN_MS));
  const cands = elig
    .filter((e) => justPractised.has(e.code) && !declined.has(e.code))
    .sort((a, b) => b.accuracy - a.accuracy);
  if (!cands.length) return null;

  const c = cands[0];
  return { code: c.code, label: skillLabel(c.code), family: c.family };
}
