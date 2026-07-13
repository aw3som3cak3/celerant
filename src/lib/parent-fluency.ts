// What the parent-view "flyt" (fluency) column should show for one skill.
//
// The distinction this enforces (bug-hunt-fluency.md §4): SEEDED ≠ EARNED. Every
// component skill is seeded with a PROVISIONAL rate at player creation
// (replay.ts) so the fluency gate is quietly satisfied — a guess from the child's
// årskurs, not something she demonstrated. Only a MEASURED rate comes from a real
// sprint. The column must therefore show a fraction ONLY for a measured rate; a
// provisional (or unknown) rate is not sprint-practised and must read as such —
// never as a fraction like "10/17" that implies completed sprints she never did.
//
// Pure and locale-free so it can be unit-tested; the view maps the kind to text.
export type FluencyInput = {
  mode: 'component' | 'compound';
  rate: number | null;
  rateState: 'unknown' | 'provisional' | 'measured';
  aim: number | null;
};

export type FluencyDisplay =
  | { kind: 'na' } // a compound: fluency does not apply
  | { kind: 'notPractised' } // a component seeded/assumed but never sprinted
  | { kind: 'measured'; rate: number; aim: number | null }; // a real sprint result

export function fluencyDisplay(s: FluencyInput): FluencyDisplay {
  if (s.mode !== 'component') return { kind: 'na' };
  if (s.rateState === 'measured' && s.rate != null) return { kind: 'measured', rate: s.rate, aim: s.aim };
  // provisional (seeded from årskurs, or retro-satisfied by testing down) and
  // unknown both mean: the child has not demonstrated this in a sprint.
  return { kind: 'notPractised' };
}
