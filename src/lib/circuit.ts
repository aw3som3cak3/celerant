// circuit.ts — the COMPOSITION tier for electronics: "Bygg en krets" (build a circuit).
//
// The screen-side MIRROR of the physical build (docs/electronics-subject-plan.md §7). The child
// COMBINES real parts — a battery, resistors with real colour bands, an LED — into a single working
// SERIES loop. This is the on-screen rehearsal that (per the PhET evidence, §1c) makes the hardware
// build faster: real building, not "recall the band value".
//
// SAME SHAPE AS THE MODELLING TIER (src/lib/modelling.ts): a scenario registry + a pure validate()
// where "the scene is the answer key". validate() is RULE-BASED TOPOLOGY, deliberately NOT a
// simulation (no SPICE, no logic-gate sim — wrong tool, and overwhelming for a 6-year-old). It reads
// the child's assembled loop and asks "does this light?" against the goal's own rules.
//
// θ-INERT, like modelling: pure types + logic only (no React, no server-only, no db/repo import). It
// READS the fluency signal to gate the surface (the demo route), but it never writes θ / attempt /
// ability / the ledger. This module is imported by BOTH the CircuitStage surface and the tests.

export type PartKind = 'battery' | 'resistor' | 'led' | 'wire';

// One part in the tray. `ohms` is set only for a resistor — its value drives the REAL colour bands
// the child reads (via <wokwi-resistor value>), so combining two resistors combines two real band
// patterns into one larger value.
export type Part = { id: string; kind: PartKind; ohms?: number };

// The child's assembled loop — the "scene". An ordered list of the placed part ids (the series
// chain), whether the LED faces the right way, and whether the child has snapped the loop shut into
// a ring. validate() reads exactly this.
export type Circuit = {
  placed: string[]; // part ids placed into the loop, in order
  ledForward: boolean; // LED orientation (only meaningful once an LED is placed)
  closed: boolean; // has the child snapped the loop into a closed ring?
};

// How the child interacts with THIS goal — kept declarative so CircuitStage renders the right dead-
// simple gesture instead of guessing from the goal id:
//   combine — tap resistors from the tray to build the target value (the series-sum puzzle)
//   close   — tap the open gap to snap the ring shut (the complete-the-loop puzzle)
//   flip    — tap the LED to turn it the right way (the polarity puzzle)
export type Interaction = 'combine' | 'close' | 'flip';

// One authored puzzle. The rules it enforces ARE its answer key; each puzzle SPENDS one real
// electronics skill (its `spends` code), which is what gates the surface. Authored (not RNG-built):
// there are three, each proving a different rule.
export type CircuitGoal = {
  id: string;
  title: string; // the Swedish instruction / situation
  hint: string; // the one-line child hint
  spends: string; // the elec_* skill code this puzzle spends (fluency-`met` gates the surface)
  interaction: Interaction;
  tray: Part[]; // the parts offered (some pre-placed by the stage, the rest chosen)
  targetOhms: number | null; // the series-sum target (combine puzzle); null = no specific target
  // Which rules the scene enforces — the "answer key" clauses:
  needBattery: boolean;
  needLed: boolean;
  needResistor: boolean; // a current-limiting resistor must be present
  needClosed: boolean; // the loop must be a closed ring
  needPolarity: boolean; // the LED must face the right way
  solution: Circuit; // the intended assembly — seeds the stage and the tests. NOT the only accepted
  // answer where a target admits several resistor pairings; validate() accepts ANY loop that lights.
};

// A part lookup within a goal's tray.
export const partById = (goal: CircuitGoal, id: string): Part | undefined => goal.tray.find((p) => p.id === id);

// The placed parts, resolved to Part records (skips any id no longer in the tray).
export function placedParts(goal: CircuitGoal, circuit: Circuit): Part[] {
  return circuit.placed.map((id) => partById(goal, id)).filter((p): p is Part => p != null);
}

// Is a kind present in the loop?
export function hasKind(goal: CircuitGoal, circuit: Circuit, kind: PartKind): boolean {
  return placedParts(goal, circuit).some((p) => p.kind === kind);
}

// THE COMBINE MODEL: two resistors in series add up. This is the same arithmetic elec_series_add
// trains — the bands the child reads are literally two parts of one larger value. Pure sum of every
// placed resistor's ohms.
export function seriesSum(goal: CircuitGoal, circuit: Circuit): number {
  return placedParts(goal, circuit).reduce((sum, p) => (p.kind === 'resistor' ? sum + (p.ohms ?? 0) : sum), 0);
}

export type Verdict = 'lit' | 'open' | 'reversed' | 'no_resistor' | 'wrong_sum';
export type Judgement = { ok: boolean; verdict: Verdict; message: string };

// THE SCENE IS THE ANSWER KEY. Rule-based topology, checked in the order a child would meet the
// problem: first is the ring even complete, then does the LED face the right way, then is the
// current limited, then does the combined value hit the target. The FIRST failing clause is
// reported — always non-punitive ("does this light?"), never a red X. A miss softens and re-serves;
// the surface never marks the child wrong.
export function validate(goal: CircuitGoal, circuit: Circuit): Judgement {
  const soft = (verdict: Verdict, message: string): Judgement => ({ ok: false, verdict, message });

  // 1 — complete loop: the required parts present AND snapped into a closed ring.
  const loopComplete =
    (!goal.needBattery || hasKind(goal, circuit, 'battery')) &&
    (!goal.needLed || hasKind(goal, circuit, 'led')) &&
    (!goal.needClosed || circuit.closed);
  if (!loopComplete) {
    return soft('open', 'Slingan är inte hel — strömmen kommer inte runt. Snäpp ihop hela vägen så det blir en ring.');
  }

  // 2 — LED polarity: it only lights one way (long leg to +).
  if (goal.needPolarity && hasKind(goal, circuit, 'led') && !circuit.ledForward) {
    return soft('reversed', 'Lysdioden sitter åt fel håll — vänd den så det långa benet möter plus (+).');
  }

  // 3 — a current-limiting resistor must be there, or the LED gets too much current.
  if (goal.needResistor && !hasKind(goal, circuit, 'resistor')) {
    return soft('no_resistor', 'Lampan behöver ett motstånd som bromsar strömmen — annars lyser den för hårt.');
  }

  // 4 — the combined resistance must hit the target (the series-sum puzzle).
  if (goal.targetOhms != null) {
    const sum = seriesSum(goal, circuit);
    if (sum !== goal.targetOhms) {
      return soft('wrong_sum', `Tillsammans blir motstånden ${sum} Ω, men du behöver ${goal.targetOhms} Ω. Prova en annan kombination.`);
    }
  }

  return { ok: true, verdict: 'lit', message: '✓ Kretsen är hel — lampan lyser!' };
}

/* ═══ THE THREE AUTHORED PUZZLES ═════════════════════════════════════════════ */

// 1 · COMBINE — "Kombinera två motstånd till 320 Ω" (spends elec_series_add). The battery + LED are
// pre-placed and closed; the child taps resistors so their REAL bands add up to 320. 100 + 220 is
// the intended pair; 120 and 470 are the tempting-but-wrong tray extras.
const R100: Part = { id: 'r100', kind: 'resistor', ohms: 100 };
const R220: Part = { id: 'r220', kind: 'resistor', ohms: 220 };
const R120: Part = { id: 'r120', kind: 'resistor', ohms: 120 };
const R470: Part = { id: 'r470', kind: 'resistor', ohms: 470 };
const BATT: Part = { id: 'batt', kind: 'battery' };
const LED: Part = { id: 'led', kind: 'led' };

const combineGoal: CircuitGoal = {
  id: 'series_320',
  title: 'Kombinera två motstånd till 320 Ω',
  hint: 'Snäpp ihop två motstånd så färgbanden tillsammans blir 320 Ω.',
  spends: 'elec_series_add',
  interaction: 'combine',
  tray: [BATT, LED, R100, R220, R120, R470],
  targetOhms: 320,
  needBattery: true,
  needLed: true,
  needResistor: true,
  needClosed: true,
  needPolarity: true,
  solution: { placed: ['batt', 'r100', 'r220', 'led'], ledForward: true, closed: true },
};

// 2 · CLOSE — "Slut kretsen så lampan lyser" (spends elec_loop). Everything is placed and the right
// way round, but the ring is OPEN — the child snaps the last connection to complete the loop.
const R220_FIXED: Part = { id: 'r220', kind: 'resistor', ohms: 220 };
const loopGoal: CircuitGoal = {
  id: 'close_loop',
  title: 'Slut kretsen så lampan lyser',
  hint: 'Strömmen behöver en hel slinga — snäpp ihop det öppna glappet.',
  spends: 'elec_loop',
  interaction: 'close',
  tray: [BATT, R220_FIXED, LED],
  targetOhms: null,
  needBattery: true,
  needLed: true,
  needResistor: true,
  needClosed: true,
  needPolarity: true,
  solution: { placed: ['batt', 'r220', 'led'], ledForward: true, closed: true },
};

// 3 · FLIP — "Vänd lysdioden rätt" (spends elec_polarity). The loop is whole but the LED is
// reversed, so nothing lights — the child turns it the right way (long leg to +).
const polarityGoal: CircuitGoal = {
  id: 'flip_led',
  title: 'Vänd lysdioden rätt',
  hint: 'Lampan lyser bara åt ett håll — vänd lysdioden så det långa benet möter plus (+).',
  spends: 'elec_polarity',
  interaction: 'flip',
  tray: [BATT, R220_FIXED, LED],
  targetOhms: null,
  needBattery: true,
  needLed: true,
  needResistor: true,
  needClosed: true,
  needPolarity: true,
  solution: { placed: ['batt', 'r220', 'led'], ledForward: true, closed: true },
};

// The scenario registry — so the demo enumerates the puzzles and a future promotion can look one up
// (mirrors modelling's SCENARIOS).
export const CIRCUIT_GOALS: readonly CircuitGoal[] = [combineGoal, loopGoal, polarityGoal] as const;

export const goalById = (id: string): CircuitGoal | undefined => CIRCUIT_GOALS.find((g) => g.id === id);
