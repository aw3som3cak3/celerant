// The whole model. An online Elo / one-parameter scheme on a single quantity:
// the child's ability θ per skill. There is no β.
//
// β appeared in the model only as θ − β, and its update aggregates evidence
// across children. With two children it would never converge — it would drift,
// and its drift would silently make θ non-comparable across time. So β is gone;
// difficulty lives in the shape of the skill graph instead (see docs/handoff.md
// §1 and src/skills.ts). p is now p = 1/(1 + e^−θ).

export type EloState = {
  theta: number;
  childObs: number;
};

export type EloUpdate = {
  theta: number;
  p: number; // predicted P(correct) before the update
};

// Predicted probability the child answers correctly. β is gone; it was zero.
export function predict(theta: number): number {
  return 1 / (1 + Math.exp(-theta));
}

// The grading table in §5, as a pure decision. Given the durable facts recorded
// on a resolved attempt — whether the child pressed "I don't know" (given is
// null), how many tries it took, and the final correctness — decide whether and
// how θ updates. Used by the live path AND by replay, so the two can never
// diverge. First-attempt-only is enforced here: a right-on-retry yields no
// update.
export type UpdateDecision = { apply: boolean; correct: number; halveKChild: boolean };

export function updateDecision(givenIsNull: boolean, tries: number, finalCorrect: number): UpdateDecision {
  if (givenIsNull) return { apply: true, correct: 0, halveKChild: true }; // "I don't know"
  if (finalCorrect === 1) {
    if (tries === 1) return { apply: true, correct: 1, halveKChild: false }; // right, first try
    return { apply: false, correct: 0, halveKChild: false }; // right, second try: no update
  }
  return { apply: true, correct: 0, halveKChild: false }; // wrong twice
}

// Apply one update. `correct` is the graded outcome in [0, 1] (see the grading
// table), not merely whether the typed answer matched. K decays with the
// child's observation count for this skill: plastic when ignorant, stable when
// informed. `halveKChild` softens the "I don't know" outcome.
export function update(state: EloState, correct: number, halveKChild = false): EloUpdate {
  const p = predict(state.theta);
  let k = 1 / (1 + 0.05 * state.childObs);
  if (halveKChild) k /= 2;
  const theta = state.theta + k * (correct - p);
  return { theta, p };
}
