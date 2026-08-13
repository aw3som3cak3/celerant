import 'server-only';
import * as repo from '@/db/repo';
import { componentFluent, type SelState } from './selector';
import {
  BY_STRATEGY,
  GRADUATED,
  L_BARE,
  L_FULL,
  pickDerivation,
  hasDerivation,
  type StrategyId,
} from './acquisition-content';

// ── SCAFFOLDED ACQUISITION — the trigger and the state (spec §2, §5, §6) ────
//
// WHERE THE DECISION LIVES: this is a GENERATION-layer module. The selector picks a skill on
// exactly the terms it always did; afterwards, generation asks acquisitionPlanFor() whether the
// item to emit is the bare fact or a faded scaffold. The single selection-layer consequence is
// that the set of acquisition-eligible codes is handed to selectItem as `acquisitionCodes`, so
// a fact the child just missed stays SELECTABLE (see selector.ts — the one touch). θ, the
// unlock gate and the fluency machinery are untouched.

export type AcquisitionPlan = {
  code: string;
  level: number; // 0 full … 3 bare (a bare item is ordinary in every respect)
  strategy: StrategyId;
};

// IGNITION (spec §2.3, open question §9.4). How much of the child's ordinary history on the
// skill the trigger looks at, and what counts as "unlearned rather than a careless slip":
//   - the most recent ordinary attempt must be a miss/idk (something is wrong RIGHT NOW), and
//   - either she has never once produced the fact cleanly in the window — a fresh table she
//     simply has not encoded, which is the natural ignition the spec asks for — or, if she has,
//     at least two of the last four attempts are misses, so one slip on a fact she owns is
//     never met with a scaffold she does not need.
const IGNITION_WINDOW = 8;
const SLIP_WINDOW = 4;
const SLIP_MISSES = 2;

export function ignites(history: boolean[] /* newest first; true = clean first-try success */): boolean {
  if (history.length === 0) return false; // never met the fact: nothing says it is unlearned
  if (history[0]) return false; // the last thing she did on it was get it right
  if (!history.some((ok) => ok)) return true; // never produced it — unlearned, ignite on the first miss
  return history.slice(0, SLIP_WINDOW).filter((ok) => !ok).length >= SLIP_MISSES; // not a slip
}

// componentFluent throws when a skill's rate was never seeded (placement did not run). The
// readiness check must fail CLOSED on that — "we don't know" is not "she is fluent".
function fluentPredicate(states: SelState[]): (code: string) => boolean {
  const byCode = new Map(states.map((s) => [s.code, s]));
  return (code: string) => {
    const s = byCode.get(code);
    if (!s) return false;
    try {
      return componentFluent(s);
    } catch {
      return false;
    }
  };
}

// Every skill this child should currently be TAUGHT rather than merely tested on, with the fade
// level and derivation to use. All three trigger clauses (spec §2) are read from data the child
// already generates — no parent decides, and nothing here is a per-skill exception list:
//   1. not graduated        — the arc ends by itself and never re-fires
//   2. inputs are fluent    — the readiness veto; without it we would "teach" a strategy on
//                             sub-facts she lacks, so we leave the skill alone and let the
//                             graph drop her lower instead (invariant 3)
//   3. the fact is unlearned — an in-progress arc, or the ignition test above
export function acquisitionPlans(playerId: string, states: SelState[]): Map<string, AcquisitionPlan> {
  const out = new Map<string, AcquisitionPlan>();
  const candidates = states.filter((s) => hasDerivation(s.code));
  if (candidates.length === 0) return out;

  const isFluent = fluentPredicate(states);
  const stateRows = repo.acquisitionStates(playerId);

  // Only skills that pass the readiness veto can ignite or continue — one query for the rest.
  const ready: { code: string; strategy: StrategyId }[] = [];
  for (const s of candidates) {
    const row = stateRows.get(s.code);
    if (row && row.fade_level >= GRADUATED) continue; // 1. graduated → acquisition is done here
    const d = pickDerivation(s.code, isFluent); // 2. readiness
    if (!d) continue;
    ready.push({ code: s.code, strategy: d.id });
  }

  const fresh = ready.filter((r) => !stateRows.has(r.code));
  const history = repo.recentSkillOutcomes(playerId, fresh.map((r) => r.code), IGNITION_WINDOW);

  for (const r of ready) {
    const row = stateRows.get(r.code);
    if (row) {
      // An arc already open: keep the strategy it started with as long as that strategy's own
      // inputs are still fluent — a child should not have the method swapped under her mid-arc.
      // Only if the stored path has fallen away do we fall back to the best fluent one.
      const stored = row.strategy as StrategyId | null;
      const keep = stored && (BY_STRATEGY.get(stored)?.inputs.every(isFluent) ?? false) ? stored : r.strategy;
      out.set(r.code, { code: r.code, level: row.fade_level, strategy: keep });
      continue;
    }
    if (ignites(history.get(r.code) ?? [])) out.set(r.code, { code: r.code, level: L_FULL, strategy: r.strategy });
  }
  return out;
}

// The plan for ONE picked skill — the generation-step question ("bare fact, or scaffold?").
export function acquisitionPlanFor(plans: Map<string, AcquisitionPlan>, code: string): AcquisitionPlan | null {
  return plans.get(code) ?? null;
}

// Open the arc when a scaffold is actually SERVED (idempotent; never re-opens a graduated
// skill). Generation writing this row is deliberate and mirrors the burst (createBurstRun): the
// server must know, at answer time, which level the child was shown — it never asks the client.
// The row is a cache; the ledger truth is attempt.acq_level, from which replay refolds it.
export function noteScaffoldServed(playerId: string, plan: AcquisitionPlan, now: number): void {
  repo.startAcquisition(playerId, plan.code, plan.strategy, now);
}

// The level an item for this skill was served at, or null when the skill is not under
// acquisition. Read from the server's own state — the client is never trusted for it.
export function servedLevel(playerId: string, code: string): number | null {
  return repo.acquisitionLevel(playerId, code);
}

// Is this attempt scaffolded (levels 0-2) as opposed to the bare L3 rung? Scaffolded attempts
// are warmup-class: weak-up θ, and NEVER a fluency/rate measure (invariant 2).
export function isScaffolded(level: number | null): boolean {
  return level != null && level < L_BARE;
}

// Advance/drop the fade schedule on one resolved answer, and graduate off L3 (spec §6): the
// skill is handed back to the ordinary selector + fluency + burst machinery and acquisition
// disappears. Returns the new state, or null when the skill was not under acquisition.
export function settleAcquisitionOnAnswer(
  playerId: string,
  code: string,
  level: number,
  correct: boolean,
  tries: number,
  idk: boolean,
  now: number,
): { level: number; graduated: boolean } | null {
  const ok = correct && tries === 1 && !idk;
  const next = repo.settleAcquisition(playerId, code, level, ok, now);
  if (!next) return null;
  return { level: next.level, graduated: next.level >= GRADUATED };
}

// The grownup-alert FALLBACK (spec §7) — the rare exception, not the front line. A skill that
// keeps failing at the FULLEST scaffold means an input we believed fluent is not really there,
// and no thinner scaffold fixes that. TODO(grownup-alert): no surface renders this yet; the
// parent-language strategy text is STRATEGY_COPY in acquisition-content.ts, keyed by the
// `strategy` this returns. Wire it into the parent view once the in-app path has real data.
export function stalledAcquisitions(playerId: string): { skillCode: string; strategy: string | null }[] {
  return repo.stalledAcquisitions(playerId);
}
