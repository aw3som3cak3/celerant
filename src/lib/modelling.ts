// modelling.ts — the APPLICATION tier: mathematical MODELLING problems.
//
// A modelling problem is NOT a word problem. A word problem hands the child the numbers and
// the operation and leaves only the arithmetic ("Susan has 4 cookies, Steve 2, how many?") —
// that is a fluency item in a costume. A modelling problem makes the child do the
// MATHEMATISATION: decide WHAT to compute. Nothing is pre-quantified; the child GATHERS or
// ASSUMES the quantities, ASSEMBLES the structure (which quantities combine, and how), then
// SUPERVISES a calculator that does the arithmetic FOR her. The SITUATION is the answer key — a
// wrong model is caught because its result is absurd IN the scene (order 576 pizzas and the room
// is buried), not because we mark a canonical answer.
//
// WHY A SEPARATE MODULE AND A SEPARATE SURFACE (ModelStage): it is UNTIMED (a stopwatch on
// modelling rewards guessing), NOT canonically graded (many valid models), and feeds NOTHING —
// no θ, no selector, no fluency gate, no ledger. Modelling ability is a DIFFERENT construct from
// arithmetic θ; if ever tracked, tracked SEPARATELY. Pure types + logic only (no React, no
// server-only) so the surface and the tests both import it, exactly like lib/choice.ts.
//
// SCENARIO-AGNOSTIC CORE. The first slice was pizza-only (× then ÷). The core is now driven by a
// per-scenario descriptor so ONE surface proves it GENERALISES across genuinely different
// mathematical STRUCTURES before it is ever sequenced into a quest:
//   pizza     — guests × slices-each, then ÷ slices-per-pizza  (multiply then divide, round up)
//   fairshare — total ÷ sharers                                (divide with a REMAINDER)
//   budget    — costA + costB, then − budget                   (add, then compare to a budget)
// Each is authored at the three lowest OPENNESS levels (openness, not the numbers, is the
// difficulty axis): L1 numbers given, pick the operations; L2 + one IRRELEVANT number to leave
// out; L3 a quantity is GATHERED from the scene or ASSUMED on a dial.

export type Op = '+' | '−' | '×' | '÷';
export const OPS: readonly Op[] = ['+', '−', '×', '÷'] as const;

// One combine step. Division is scenario-specific: 'ceil' orders whole units (you cannot buy half
// a pizza — round UP), 'floor' shares fairly and keeps the REMAINDER (what will not divide evenly).
export function evalStep(a: number, b: number, op: Op, divMode: 'ceil' | 'floor' = 'ceil'): { value: number; remainder: number; rounded: boolean } {
  switch (op) {
    case '+':
      return { value: a + b, remainder: 0, rounded: false };
    case '−':
      return { value: a - b, remainder: 0, rounded: false };
    case '×':
      return { value: a * b, remainder: 0, rounded: false };
    case '÷': {
      if (b === 0) return { value: 0, remainder: 0, rounded: false };
      if (divMode === 'floor') {
        // Fair sharing: each gets floor(a/b); what is left over is the remainder.
        return { value: Math.floor(a / b), remainder: ((a % b) + b) % b, rounded: false };
      }
      // Ordering whole units: round up, and flag it so the calculator can narrate the rounding.
      const up = Math.ceil(a / b);
      return { value: up, remainder: 0, rounded: up * b !== a };
    }
  }
}

// A named quantity the child can drop into a model slot. `relevant:false` marks the L2 distractor
// (present in the tray, absurd if used). `id` is scenario-defined (a plain string now, not a fixed
// union, so a new scenario names its own quantities).
export type Quantity = { id: string; value: number; label: string; relevant: boolean };

// The child's assembled model: a CHAIN of rows. Row 0 combines two tray quantities; each later row
// combines the previous row's RESULT with one more tray quantity. rowCount is 1 (fairshare) or 2
// (pizza, budget) — the surface renders exactly that many rows.
export type Row = { aId?: string; bId: string; op: Op }; // aId only on row 0
export type Model = { rows: Row[] };

export type Openness = 1 | 2 | 3;
export type SceneMode = 'pile' | 'share' | 'budget';

export type GatherSpec = { quantityId: string; actorKind: string; fullCount: number; hint: string };
export type AssumeSpec = { quantityId: string; min: number; max: number; hint: string; unit: string; actorKind: string };

export type ModellingProblem = {
  scenario: 'pizza' | 'fairshare' | 'budget';
  openness: Openness;
  title: string; // the SITUATION text (worded → reading-gated when promoted; see report)
  quantities: Quantity[]; // includes the L2 distractor (relevant:false) when present
  rowCount: 1 | 2;
  divMode: 'ceil' | 'floor';
  intended: Model; // the sensible model — seeds the plan at L1/L3 (operands pre-placed, child picks
  // the ops) and explains after. NOT the single graded answer: validate() accepts ANY model whose
  // result makes sense in the scene.
  gather?: GatherSpec; // L3: tap actors to count a quantity out of the scene
  assume?: AssumeSpec; // L3: dial a quantity the child must decide — any reasonable value accepted
  // ── scene / display (the situation IS the feedback, so it is scenario-specific) ──
  sceneMode: SceneMode;
  actorKind: string; // the actors drawn in the scene
  actorCountId: string; // the quantity giving how many actors to draw
  resultKind?: string; // emoji for the result pile / each-share (pizza, cookie)
  goods?: string[]; // budget: the goods being bought
  resultUnit: string; // "pizzor" | "kakor var" | "kr"
};

export type Rng = { int(a: number, b: number): number; pick<T>(xs: readonly T[]): T };

export const qval = (p: ModellingProblem, id: string | undefined): number =>
  (id ? p.quantities.find((q) => q.id === id)?.value : 0) ?? 0;

// Replace quantity VALUES (used by the surface to bake in what the child gathered/assumed before
// the pure evaluator/validator see the problem). Returns a fresh problem; never mutates.
export function withValues(p: ModellingProblem, overrides: Record<string, number>): ModellingProblem {
  return { ...p, quantities: p.quantities.map((q) => (q.id in overrides ? { ...q, value: overrides[q.id] } : q)) };
}

// The tray, relevant quantities first and any distractor last (stable order).
export function quantities(p: ModellingProblem): Quantity[] {
  return [...p.quantities].sort((a, b) => Number(b.relevant) - Number(a.relevant));
}

export type EvaldRow = { a: number; b: number; op: Op; value: number; remainder: number; rounded: boolean };

// Evaluate the child's assembled model into a final number (+ the intermediate rows for the visible
// calculator, and the final remainder for fair sharing). Pure: the situation, not the UI, decides.
export function evaluateModel(p: ModellingProblem, m: Model): { rows: EvaldRow[]; result: number; remainder: number } {
  const rows: EvaldRow[] = [];
  let prev = 0;
  m.rows.forEach((row, i) => {
    const a = i === 0 ? qval(p, row.aId) : prev;
    const b = qval(p, row.bId);
    const s = evalStep(a, b, row.op, p.divMode);
    rows.push({ a, b, op: row.op, value: s.value, remainder: s.remainder, rounded: s.rounded });
    prev = s.value;
  });
  const last = rows[rows.length - 1];
  return { rows, result: last.value, remainder: last.remainder };
}

export type Verdict = 'good' | 'few' | 'many' | 'absurd';
export type Judgement = { verdict: Verdict; message: string };

// THE SITUATION IS THE ANSWER KEY. Each scenario classifies the child's result against its OWN
// scene rather than against a canonical number, and the message is always "does this make sense?",
// never correct/wrong. Dispatched by scenario.
export function validate(p: ModellingProblem, ev: { result: number; remainder: number; rows: EvaldRow[] }): Judgement {
  if (p.scenario === 'fairshare') return validateFairShare(p, ev);
  if (p.scenario === 'budget') return validateBudget(p, ev);
  return validatePizza(p, ev);
}

function validatePizza(p: ModellingProblem, ev: { result: number }): Judgement {
  const needed = qval(p, 'guests') * qval(p, 'slicesEach');
  const per = qval(p, 'slicesPerPizza');
  const ideal = Math.max(0, Math.ceil(needed / per));
  const result = ev.result;
  const covers = result * per >= needed;
  if (!covers) return { verdict: 'few', message: 'Det räcker inte — några gäster får ingen pizza. Tomma tallrikar!' };
  if (result <= ideal) return { verdict: 'good', message: 'Precis lagom — alla får äta och nästan inget blir över.' };
  if (result >= ideal * 3 || result >= needed)
    return { verdict: 'absurd', message: `${result} pizzor?! Rummet begravs i pizza. Något blev nog gånger istället för delat.` };
  return { verdict: 'many', message: 'Det blir en hel del över — lite för många pizzor beställda.' };
}

function validateFairShare(p: ModellingProblem, ev: { result: number; remainder: number }): Judgement {
  const total = qval(p, 'total');
  const sharers = qval(p, 'sharers');
  const each = ev.result;
  const fair = Math.floor(total / sharers);
  const rem = total - each * sharers;
  if (each < 0 || each * sharers > total)
    return { verdict: 'absurd', message: `Var och en skulle få ${each}? Det finns bara ${total} — det går inte. Prova att DELA.` };
  if (each === fair) {
    return rem > 0
      ? { verdict: 'good', message: `Var och en får ${each}, och ${rem} blir över — det går inte jämnt ut, men alla får lika.` }
      : { verdict: 'good', message: `Var och en får precis ${each}. Rättvist, inget blir över.` };
  }
  return { verdict: 'few', message: `Om var och en bara får ${each} blir ${rem} kvar i högen — de kunde delat mer rättvist.` };
}

function validateBudget(p: ModellingProblem, ev: { result: number; rows: EvaldRow[] }): Judgement {
  const budget = qval(p, 'budget');
  const total = ev.rows[0]?.value ?? 0; // costA + costB
  const over = ev.result; // total − budget  (>0 short, ≤0 money left)
  // A sensible party costs at most a little over the budget; a PRODUCT of the two prices always
  // lands well past 2× the budget (checked across the authored ranges), so that is the absurd tell.
  if (total > budget * 2 || over > budget * 2)
    return { verdict: 'absurd', message: `${total} kr?! Så dyrt kan kalaset inte bli — något blev gånger istället för plus.` };
  if (over > 0) return { verdict: 'few', message: `Det räcker inte — det saknas ${over} kr. Igelkotten kan inte köpa allt.` };
  if (over === 0) return { verdict: 'good', message: 'Det räcker precis — pengarna tar slut på öret.' };
  return { verdict: 'good', message: `Det räcker! ${-over} kr blir kvar.` };
}

// Emoji animals used as actors (no human asset exists, and animals fit the app's register). Kept
// off the fox/hotdog test family (MEMORY: fox-family-is-test).
const GUEST_KINDS = ['turtle', 'koala', 'panda', 'rabbit', 'penguin', 'owl', 'hedgehog', 'frog'] as const;

/* ═══ SCENARIO 1 · PIZZA — multiply then divide (round up) ═══════════════════ */
const PIZZA_INTENDED: Model = { rows: [{ aId: 'guests', bId: 'slicesEach', op: '×' }, { bId: 'slicesPerPizza', op: '÷' }] };

export function pizzaProblem(r: Rng, openness: Openness): ModellingProblem {
  const guestKind = r.pick(GUEST_KINDS);
  const slicesPerPizza = 8;
  const slicesEach = r.pick([2, 3] as const);
  const pizzas = r.int(2, 4);
  const guests = Math.floor((pizzas * slicesPerPizza) / slicesEach);
  const quantities: Quantity[] = [
    { id: 'guests', value: guests, label: 'gäster', relevant: true },
    { id: 'slicesEach', value: slicesEach, label: 'bitar var', relevant: true },
    { id: 'slicesPerPizza', value: slicesPerPizza, label: 'bitar/pizza', relevant: true },
  ];
  if (openness >= 2) quantities.push({ id: 'distractor', value: r.int(3, 6), label: 'börjar kl', relevant: false });
  return {
    scenario: 'pizza',
    openness,
    title: 'Det är kalas. Gästerna vill ha pizza. Hur många pizzor ska vi beställa?',
    quantities,
    rowCount: 2,
    divMode: 'ceil',
    intended: PIZZA_INTENDED,
    gather: openness === 3 ? { quantityId: 'guests', actorKind: guestKind, fullCount: guests, hint: 'Räkna gästerna — tryck på varje djur.' } : undefined,
    assume: openness === 3 ? { quantityId: 'slicesEach', min: 1, max: 4, hint: 'Hur många bitar äter varje gäst? Du bestämmer.', unit: 'bitar var', actorKind: guestKind } : undefined,
    sceneMode: 'pile',
    actorKind: guestKind,
    actorCountId: 'guests',
    resultKind: 'pizza',
    resultUnit: 'pizzor',
  };
}

/* ═══ SCENARIO 2 · FAIR SHARE — divide with a remainder ══════════════════════ */
const FAIRSHARE_INTENDED: Model = { rows: [{ aId: 'total', bId: 'sharers', op: '÷' }] };
const SHARE_ACTORS = ['squirrel', 'mouse', 'rabbit', 'hamster', 'panda'] as const;

export function fairShareProblem(r: Rng, openness: Openness): ModellingProblem {
  const actor = r.pick(SHARE_ACTORS);
  const sharers = r.int(3, 5);
  const each = r.int(2, 4);
  const rem = r.int(0, sharers - 1); // authored so it does not always divide evenly
  const total = sharers * each + rem;
  const quantities: Quantity[] = [
    { id: 'total', value: total, label: 'kakor', relevant: true },
    { id: 'sharers', value: sharers, label: 'djur', relevant: true },
  ];
  if (openness >= 2) quantities.push({ id: 'distractor', value: r.int(2, 6), label: 'kl', relevant: false });
  return {
    scenario: 'fairshare',
    openness,
    title: 'Djuren hittade en burk med kakor. Dela dem rättvist. Hur många får var och en?',
    quantities,
    rowCount: 1,
    divMode: 'floor',
    intended: FAIRSHARE_INTENDED,
    // Fair share has no natural "assume" quantity (the counts are exact), so L3 GATHERS the sharers
    // and dials nothing — the dial mechanic is exercised by pizza and budget instead.
    gather: openness === 3 ? { quantityId: 'sharers', actorKind: actor, fullCount: sharers, hint: 'Räkna djuren som ska dela — tryck på varje.' } : undefined,
    sceneMode: 'share',
    actorKind: actor,
    actorCountId: 'sharers',
    resultKind: 'cookie',
    resultUnit: 'kakor var',
  };
}

/* ═══ SCENARIO 3 · BUDGET — add, then compare to a budget ════════════════════ */
const BUDGET_INTENDED: Model = { rows: [{ aId: 'costCake', bId: 'costBalloons', op: '+' }, { bId: 'budget', op: '−' }] };

export function budgetProblem(r: Rng, openness: Openness): ModellingProblem {
  const costCake = r.int(15, 35);
  const costBalloons = r.int(6, 20);
  const kvar = r.int(3, 15);
  const budget = costCake + costBalloons + kvar; // authored so the intended plan JUST fits
  const quantities: Quantity[] = [
    { id: 'costCake', value: costCake, label: 'kr tårta', relevant: true },
    { id: 'costBalloons', value: costBalloons, label: 'kr ballonger', relevant: true },
    { id: 'budget', value: budget, label: 'kr i plånboken', relevant: true },
  ];
  if (openness >= 2) quantities.push({ id: 'distractor', value: r.int(3, 8), label: 'gäster', relevant: false });
  return {
    scenario: 'budget',
    openness,
    title: 'Igelkotten handlar till kalaset: en tårta och ballonger. Räcker pengarna?',
    quantities,
    rowCount: 2,
    divMode: 'ceil',
    intended: BUDGET_INTENDED,
    // L3 ASSUMES the balloon price (the child does not know it — a genuine modelling guess, checked
    // against the budget by the scene). No gather here; the count mechanic is exercised elsewhere.
    assume: openness === 3 ? { quantityId: 'costBalloons', min: 5, max: 25, hint: 'Du vet inte vad ballongerna kostar — gissa en rimlig summa.', unit: 'kr', actorKind: 'party_popper' } : undefined,
    sceneMode: 'budget',
    actorKind: 'hedgehog',
    actorCountId: 'budget', // unused for budget scene (drawn from goods), kept for the type
    goods: ['ice_cream', 'party_popper'],
    resultUnit: 'kr',
  };
}

// The scenario registry — so the demo can enumerate them and a future promotion can look one up.
export const SCENARIOS: { id: ModellingProblem['scenario']; label: string; build: (r: Rng, o: Openness) => ModellingProblem }[] = [
  { id: 'pizza', label: 'Pizzakalas (× och ÷)', build: pizzaProblem },
  { id: 'fairshare', label: 'Dela kakorna (÷ med rest)', build: fairShareProblem },
  { id: 'budget', label: 'Räcker pengarna? (+ och −)', build: budgetProblem },
];

// The sensible order for a scenario (used only in tests / explanation — never shown as the one
// right answer). Returns the intended model's result.
export function sensibleResult(p: ModellingProblem): number {
  return evaluateModel(p, p.intended).result;
}
