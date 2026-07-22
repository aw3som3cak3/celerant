// The whole model. A one-parameter scheme on the child's ability θ per skill,
// with per-skill sharpness (RD) and volatility — the useful half of Glicko-2,
// applied ONE-SIDED (instrumentation.md §3): only the child's numbers move,
// against the skill's FIXED tier difficulty. There is no β, and problem types are
// NOT rated (§6) — difficulty lives in the shape of the skill graph.
//
// One-sided means the opponent (the skill's tier) has rating 0 and RD 0, so the
// Glicko g-factor is 1 and E = σ(θ) = predict(θ): the update stays aligned with
// the selector's 0.80 target, with no bias. RD only scales the step and grows on
// idle; volatility tracks how erratic the child is on the skill.

// τ (tau): the Glicko-2 system constant, damping volatility change. A GUESS in
// the 0.4–0.6 range (instrumentation.md §3); the phase-2 simulation should be
// re-run whenever it changes. See README.
export const TAU = 0.5;

export const SEED_RD = 1.0; // a seeded θ is a rumour: fairly uncertain
export const SEED_VOL = 0.06; // Glicko-2 default volatility
const RD_MAX = 1.6; // an idle skill only gets so uncertain
const MAX_STEP = 1.0; // hard cap on |Δθ| from a single answer (belt-and-suspenders)

// One rating period = one day. Idle time is measured in periods, so a skill
// unpractised for weeks becomes uncertain again — spacing affecting BELIEF.
export const RATING_PERIOD_MS = 24 * 3600 * 1000;
const IDLE_C = 0.1; // RD growth per √period of idleness (a guess; see README)

export type EloState = {
  theta: number;
  rd: number;
  vol: number;
  childObs: number;
};

export type EloUpdate = {
  theta: number;
  rd: number;
  vol: number;
  p: number; // predicted P(correct) before the update
};

// Predicted probability the child answers correctly. β is gone; it was zero.
export function predict(theta: number): number {
  return 1 / (1 + Math.exp(-theta));
}

// The grading table (§5), as a pure decision. Unchanged by Glicko: whether and
// how θ updates given the durable facts of a resolved attempt. Used by the live
// path AND replay, so the two can never diverge. First-attempt-only enforced.
export type UpdateDecision = { apply: boolean; correct: number; halveKChild: boolean };

export function updateDecision(givenIsNull: boolean, tries: number, finalCorrect: number): UpdateDecision {
  // Measurement principle: score ONLY the first independent response; a retry or a
  // worked-example reveal is teaching, not assessment. So a success counts iff it was
  // right on the FIRST try; anything that needed a retry means the first response was
  // wrong and is scored as an error. (Previously a "right on the second try" was
  // dropped — apply:false — which silently deleted a first-try failure, biasing θ
  // upward and, through item selection, kept serving items too hard → more retries →
  // more dropped errors. Counting the first response breaks that loop.)
  if (givenIsNull) return { apply: true, correct: 0, halveKChild: true }; // "I don't know"
  if (finalCorrect === 1 && tries === 1) return { apply: true, correct: 1, halveKChild: false }; // right, first try
  return { apply: true, correct: 0, halveKChild: false }; // wrong first try (whether or not fixed on the retry)
}

// Idle RD growth: a skill's uncertainty rises with the time since it was last
// seen. rd* = √(rd² + IDLE_C²·periods), capped.
function inflateRd(rd: number, idlePeriods: number): number {
  const grown = Math.sqrt(rd * rd + IDLE_C * IDLE_C * Math.max(0, idlePeriods));
  return Math.min(RD_MAX, grown);
}

// The Glicko-2 volatility update (Illinois root-find). Deterministic — no rng, a
// fixed convergence tolerance — so the live path and replay produce identical
// floats, preserving the byte-for-byte replay guarantee.
function newVolatility(phi: number, vol: number, v: number, delta: number): number {
  const a = Math.log(vol * vol);
  const phi2 = phi * phi;
  const d2 = delta * delta;
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const denom = phi2 + v + ex;
    return (ex * (d2 - denom)) / (2 * denom * denom) - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;
  if (d2 > phi2 + v) {
    B = Math.log(d2 - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

// Apply one update. `correct` is the graded outcome in [0,1] (see the grading
// table). RD replaces the crude k = 1/(1+0.05n): it grows on idle (via
// idlePeriods) and shrinks with practice, so a long-unpractised skill's next
// answer counts more. The Δθ ∝ rd'² scaling is itself the slip/lapse floor — a
// careless miss on a mastered (low-RD) skill barely moves θ — with MAX_STEP as a
// hard backstop. `halveKChild` softens the "I don't know" outcome.
export function update(state: EloState, correct: number, halveKChild = false, idlePeriods = 0): EloUpdate {
  const phiStar = inflateRd(state.rd, idlePeriods);
  const E = predict(state.theta); // opponent at 0, g = 1
  const v = 1 / (E * (1 - E));
  const s = correct;
  const delta = v * (s - E);

  const vol = newVolatility(phiStar, state.vol, v, delta);
  const rd = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);

  let dTheta = rd * rd * (s - E);
  if (halveKChild) dTheta /= 2;
  if (dTheta > MAX_STEP) dTheta = MAX_STEP;
  else if (dTheta < -MAX_STEP) dTheta = -MAX_STEP;

  return { theta: state.theta + dTheta, rd, vol, p: E };
}
