import type Database from 'better-sqlite3';

// The pre-registered theses (evidence-and-theses.md §4). Seeded ONCE, at first
// boot, with registered_at = the real time — the honest registration moment,
// before any probe data accrues (git history is the second, independent
// timestamp). Registering T5/T6 now, years before they can be resolved, is the
// point: a prediction dated before the data is credible; one written after is a
// story. Statements are verbatim and MUST NOT be edited once live (that would be
// moving the goalposts); `outcome`/`resolved_at` are filled in only later.
export const THESES: { thesis_id: string; statement: string; measure: string; threshold: string }[] = [
  {
    thesis_id: 'T1',
    statement:
      'When a child’s rate on a component crosses its fluency aim, their median latency on compound items containing that component decreases, without the compound skill itself having been practised more.',
    measure: 'Median latency_ms on compounds containing the component, 10 attempts before vs after the aim-crossing; per component, per child (n=1 stacked, not pooled).',
    threshold: 'A decrease, per component. The Morningside thesis; the single most important claim.',
  },
  {
    thesis_id: 'T2',
    statement: 'Children sustain practice at ~80% success without rising abandonment — the 80% target is not so hard that children quit.',
    measure: 'Session completion rate and ended_early rate against the running first-try accuracy.',
    threshold: 'Completion stays flat or rises as accuracy holds near 0.80. Can genuinely fail.',
  },
  {
    thesis_id: 'T3',
    statement: 'Improvement on the held-out arith_v1 probe tracks practice, confirming the gain is real learning and not item-specific familiarity.',
    measure: 'Probe accuracy and latency, baseline vs 3 months, against practice volume.',
    threshold: 'Probe scores improve with practice volume across children. Falsified if probe is flat while θ climbs.',
  },
  {
    thesis_id: 'T4',
    statement: 'Children gated into compound skills only after component fluency solve those compounds with fewer misses than a naive accuracy-only gate would predict.',
    measure: 'First-attempt accuracy on newly-unlocked compounds vs the same children’s accuracy on compounds reached under the interim accuracy-only gate.',
    threshold: 'Fluency-gated unlocks show higher first-try accuracy.',
  },
  {
    thesis_id: 'T5',
    statement: 'Item difficulty within a skill varies systematically with the tagged features — 7×8 reliably harder than 7×2, carrying harder than not, borrow-across-zero its own spike.',
    measure: 'The LLTM fit from instrumentation.md §2, once fittable (needs the population).',
    threshold: 'Feature weights ordered as the cognitive-load literature predicts, and predict held-out accuracy better than the flat per-skill model.',
  },
  {
    thesis_id: 'T6',
    statement: 'Skills unlock in an order where post-unlock accuracy does not collapse — the hand-authored requires edges actually capture prerequisite structure.',
    measure: 'handoff.md §7’s first detector across all children — frequency of post-unlock accuracy collapse per edge.',
    threshold: 'Collapse is rare; edges that show it are mis-specified and get flagged.',
  },
  // Quasi-experimental (quasi-experimental.md §6) — the three internal controls,
  // each with an explicit failure condition, so passing means something.
  {
    thesis_id: 'T7',
    statement: 'Staggered baseline: a child’s practice-window probe slope exceeds their baseline-window slope (the same child aging and being schooled, but not yet practising).',
    measure: 'Per child, pooled: practice-window probe slope minus baseline-window slope, baseline defined post-hoc from ledger practice volume, ≥2 baseline points.',
    threshold: 'CONFIRMED: positive contrast pooled. FAILS: contrast ≤ 0, or probe rises as fast in baseline as in practice (maturation explains it).',
  },
  {
    thesis_id: 'T8',
    statement: 'Untrained-skill crossover: a trained family’s probe subscore rises more than an untrained family’s subscore, measured on the same child in the same window.',
    measure: 'Within-child difference (trained minus untrained subscore change), clean-control families only (component leakage flagged and excluded).',
    threshold: 'CONFIRMED: positive within-child difference. FAILS: untrained families rise as fast as trained (general test-familiarity, not learning).',
  },
  {
    thesis_id: 'T9',
    statement: 'Dose-response: probe gain increases with practice dose, and dose predicts gain better than elapsed calendar time.',
    measure: 'Response (probe-score change per interval) fitted against dose (first-attempt items), beside a calendar-time-only model.',
    threshold: 'CONFIRMED: positive dose slope, outperforming the time-only model. FAILS: gain flat across doses, or explained by elapsed time alone.',
  },
];

// Idempotent per thesis (INSERT OR IGNORE on the unique thesis_id): registers any
// MISSING thesis at `now` and never re-stamps an existing one — so adding T7–T9
// later stamps them with their real, later registration time, while T1–T6 keep
// their original. A thesis registered after its supporting data is inadmissible
// (§6, enforced in resolveThesis), which is exactly why the timestamp must be the
// honest first-seen moment.
export function seedPrereg(db: Database.Database, now: number): void {
  const ins = db.prepare('INSERT OR IGNORE INTO prereg (thesis_id, statement, measure, threshold, registered_at) VALUES (?, ?, ?, ?, ?)');
  const tx = db.transaction(() => {
    for (const t of THESES) ins.run(t.thesis_id, t.statement, t.measure, t.threshold, now);
  });
  tx();
}
