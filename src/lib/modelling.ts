// modelling.ts — the APPLICATION tier: mathematical MODELLING problems.
//
// A modelling problem is NOT a word problem. A word problem hands the child the numbers and
// the operation and leaves only the arithmetic ("Susan has 4 cookies, Steve 2, how many?") —
// that is a fluency item in a costume, and the graph already has those. A modelling problem
// makes the child do the MATHEMATISATION: decide WHAT to compute. Nothing is pre-quantified;
// the child GATHERS or ASSUMES the quantities, ASSEMBLES the structure (which quantities
// combine, and how), and then SUPERVISES a calculator that does the arithmetic FOR her. The
// SITUATION is the answer key — a wrong model is caught because its result is absurd IN the
// scene (order 576 pizzas and the room is buried), not because we mark a canonical answer.
//
// WHY THIS IS A SEPARATE MODULE (and a separate SURFACE — see ModelStage):
//  - It is UNTIMED. A stopwatch on modelling rewards guessing and punishes thinking, so it
//    never touches InputStage's client clock (whose whole reason to exist is that clock).
//  - It is NOT canonically graded. grade() compares one string to one answer; here there are
//    many valid models, so validation is "does the result make sense in the situation?".
//  - It does NOT feed θ, the selector, the fluency gate or the ledger. Modelling ability is a
//    DIFFERENT construct from arithmetic θ; if ever tracked it is tracked SEPARATELY. This
//    slice is standalone (the /model-demo surface) and writes nothing.
// Pure types + logic only (no React, no server-only) so the surface and any future test both
// import it, exactly like lib/choice.ts.
//
// FIRST SLICE: one scenario — the pizza party ("pizzakalas") — authored at the three lowest
// OPENNESS levels. Openness, not the numbers, is the difficulty axis (spec §DIFFICULTY):
//   L1  numbers given; the child picks only the OPERATIONS.
//   L2  numbers given + one IRRELEVANT number the child must leave out of the model.
//   L3  the guest count is GATHERED from the scene and the slices-each is ASSUMED on a dial;
//       then the same operation choice. (Fully-open Fermi framing is L4 — deferred.)

export type Op = '+' | '−' | '×' | '÷';
export const OPS: readonly Op[] = ['+', '−', '×', '÷'] as const;

// One combine step of the child's model: two operands and the chosen operator. The result of
// evalStep feeds the next step (so a two-step model — total slices, then pizzas — is a chain).
export function evalStep(a: number, b: number, op: Op): { value: number; rounded: boolean } {
  switch (op) {
    case '+':
      return { value: a + b, rounded: false };
    case '−':
      return { value: a - b, rounded: false };
    case '×':
      return { value: a * b, rounded: false };
    case '÷': {
      // Pizzas are whole: you cannot order half of one, so a division ROUNDS UP (ceil) and the
      // `rounded` flag lets the calculator narrate "det går inte jämnt ut — avrunda uppåt". This
      // keeps every value an integer (the app never shows a float) and models the real decision.
      if (b === 0) return { value: 0, rounded: false };
      const q = a / b;
      const up = Math.ceil(q);
      return { value: up, rounded: up !== q };
    }
  }
}

// A named quantity the child can drop into a model slot. `id` identifies it for the intended
// path; `relevant:false` marks the L2 distractor (present in the tray, absurd if used).
export type Quantity = {
  id: 'guests' | 'slicesEach' | 'slicesPerPizza' | 'distractor';
  value: number;
  label: string; // Swedish, shown on the chip — e.g. "gäster"
  unit: string; // e.g. "bitar var"
  relevant: boolean;
};

// The child's assembled model: two chained combine steps. Step 1 combines two tray quantities;
// step 2 combines step-1's result with a third. Each row carries the operand VALUES it was built
// from (so validation and the compute animation are pure functions of the model, not the UI).
export type Model = {
  row1: { aId: Quantity['id']; bId: Quantity['id']; op: Op };
  row2: { bId: Quantity['id']; op: Op }; // row2.a is always row1's result
};

export type Openness = 1 | 2 | 3;

export type ModellingProblem = {
  scenario: 'pizza';
  openness: Openness;
  title: string; // the SITUATION text (worded → reading-gated when promoted; see report)
  gather: boolean; // L3: the guest count is gathered by tapping the scene, not given
  assume: boolean; // L3: the slices-each is set on a dial by the child, any reasonable value
  guests: number;
  slicesEach: number; // the AUTHORED sensible value (L1/L2 given; L3 the dial's default)
  slicesPerPizza: number; // a scene property, always given (a pizza = N slices)
  assumeRange: { min: number; max: number }; // the dial bounds — any value here is accepted
  distractor?: Quantity; // L2+: the irrelevant number to ignore
  guestKind: string; // emoji asset name for the party guests (an animal, no human asset exists)
  // The INTENDED model (total slices = guests × slicesEach, then pizzas = ÷ slicesPerPizza). Used
  // to seed the plan at L1 (operands pre-placed, child picks the ops) and to explain after. It is
  // NOT the single graded answer — the validator accepts ANY model whose result makes sense.
  intended: Model;
};

// Emoji animals used as party guests (no human asset exists, and animal guests fit the app's
// register). Kept off the fox/hotdog test family (MEMORY: fox-family-is-test).
const GUEST_KINDS = ['turtle', 'koala', 'panda', 'rabbit', 'penguin', 'owl', 'hedgehog', 'frog'] as const;

export type Rng = { int(a: number, b: number): number; pick<T>(xs: readonly T[]): T };

// The quantities of a problem as a tray, in a stable order (relevant first, distractor last).
export function quantities(p: ModellingProblem): Quantity[] {
  const base: Quantity[] = [
    { id: 'guests', value: p.guests, label: 'gäster', unit: 'st', relevant: true },
    { id: 'slicesEach', value: p.slicesEach, label: 'bitar var', unit: 'bitar/gäst', relevant: true },
    { id: 'slicesPerPizza', value: p.slicesPerPizza, label: 'bitar/pizza', unit: 'bitar', relevant: true },
  ];
  return p.distractor ? [...base, p.distractor] : base;
}

const qval = (p: ModellingProblem, id: Quantity['id']): number =>
  quantities(p).find((q) => q.id === id)?.value ?? 0;

// Evaluate the child's assembled model into a final number, plus the two intermediate rows (for
// the visible calculator). Pure: the situation, not the UI, decides what the model computes.
export function evaluateModel(p: ModellingProblem, m: Model): {
  row1: { a: number; b: number; op: Op; value: number; rounded: boolean };
  row2: { a: number; b: number; op: Op; value: number; rounded: boolean };
  result: number;
} {
  const a1 = qval(p, m.row1.aId);
  const b1 = qval(p, m.row1.bId);
  const s1 = evalStep(a1, b1, m.row1.op);
  const b2 = qval(p, m.row2.bId);
  const s2 = evalStep(s1.value, b2, m.row2.op);
  return {
    row1: { a: a1, b: b1, op: m.row1.op, value: s1.value, rounded: s1.rounded },
    row2: { a: s1.value, b: b2, op: m.row2.op, value: s2.value, rounded: s2.rounded },
    result: s2.value,
  };
}

// The sensible order for THIS situation (used only to classify a result — never shown as the one
// right answer). Guests each eat `slicesEach`; a pizza holds `slicesPerPizza`; round up.
export function sensiblePizzas(p: ModellingProblem, slicesEach = p.slicesEach): number {
  const needed = p.guests * slicesEach;
  return Math.max(0, Math.ceil(needed / p.slicesPerPizza));
}

export type Verdict = 'good' | 'few' | 'many' | 'absurd';

// THE SITUATION IS THE ANSWER KEY. Classify the child's result against the scene rather than
// against a canonical number: enough pizzas so everyone eats and not a mountain over → it makes
// sense; too few → empty plates; a little over → some left; a wild over (multiply where you
// should divide) → the room is buried. Feedback is "does this make sense?", never correct/wrong.
export function validate(p: ModellingProblem, result: number, slicesEach = p.slicesEach): {
  verdict: Verdict;
  message: string;
} {
  const needed = p.guests * slicesEach;
  const ideal = Math.max(0, Math.ceil(needed / p.slicesPerPizza));
  const covers = result * p.slicesPerPizza >= needed;
  if (!covers) {
    return { verdict: 'few', message: 'Det räcker inte — några gäster får ingen pizza. Tomma tallrikar!' };
  }
  if (result <= ideal) {
    return { verdict: 'good', message: 'Precis lagom — alla får äta och nästan inget blir över.' };
  }
  // A wild over-order: multiplying where you should divide buries the room (the 576-pizza case).
  const buried = result >= ideal * 3 || result >= needed;
  if (buried) {
    return { verdict: 'absurd', message: `${result} pizzor?! Rummet begravs i pizza. Något blev nog gånger istället för delat.` };
  }
  return { verdict: 'many', message: 'Det blir en hel del över — lite för många pizzor beställda.' };
}

// The intended model for the pizza scenario: guests × slicesEach = total slices, then
// total ÷ slicesPerPizza = pizzas.
const PIZZA_INTENDED: Model = {
  row1: { aId: 'guests', bId: 'slicesEach', op: '×' },
  row2: { bId: 'slicesPerPizza', op: '÷' },
};

// Author one pizza-party problem at the given openness. Deterministic from the rng (same
// discipline as skills.ts generators) so a seed reproduces the exact situation — useful for
// tests and for the shared client/server builder pattern if this is ever promoted.
export function pizzaProblem(r: Rng, openness: Openness): ModellingProblem {
  const guestKind = r.pick(GUEST_KINDS);
  const slicesPerPizza = 8; // a pizza is cut into 8 — shown, not derived
  // Guests and slices-each are chosen so the intended path is a clean integer order, and small
  // enough to stay concrete on a tablet. slicesEach ∈ {2,3}; guests picked to fill whole pizzas
  // at the sensible slices-each, but the child never sees that arithmetic pre-done.
  const slicesEach = r.pick([2, 3] as const);
  const pizzas = r.int(2, 4);
  const guests = Math.floor((pizzas * slicesPerPizza) / slicesEach); // e.g. 8 slices/pizza, 2 each → 4·pizzas guests
  const p: ModellingProblem = {
    scenario: 'pizza',
    openness,
    title:
      openness === 3
        ? 'Djuren har kalas och vill ha pizza. Hur många pizzor ska vi beställa?'
        : `Det är kalas. Gästerna vill ha pizza. Hur många pizzor ska vi beställa?`,
    gather: openness === 3,
    assume: openness === 3,
    guests,
    slicesEach,
    slicesPerPizza,
    assumeRange: { min: 1, max: 4 },
    guestKind,
    intended: PIZZA_INTENDED,
  };
  if (openness >= 2) {
    // The irrelevant number: the party's start time. A real quantity in the situation, but nothing
    // to do with how much pizza — noticing that is the L2 skill. Never on the intended path.
    p.distractor = { id: 'distractor', value: r.int(3, 6), label: 'börjar kl', unit: '(klockslag)', relevant: false };
  }
  return p;
}
