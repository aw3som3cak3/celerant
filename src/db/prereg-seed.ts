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
];

// Idempotent: inserts the theses only if the table is empty, so it registers
// exactly once (at the first boot after deploy) and never re-stamps.
export function seedPrereg(db: Database.Database, now: number): void {
  const n = (db.prepare('SELECT COUNT(*) c FROM prereg').get() as { c: number }).c;
  if (n > 0) return;
  const ins = db.prepare('INSERT INTO prereg (thesis_id, statement, measure, threshold, registered_at) VALUES (?, ?, ?, ?, ?)');
  const tx = db.transaction(() => {
    for (const t of THESES) ins.run(t.thesis_id, t.statement, t.measure, t.threshold, now);
  });
  tx();
}
