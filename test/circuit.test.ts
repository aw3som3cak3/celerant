import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  validate,
  seriesSum,
  hasKind,
  placedParts,
  goalById,
  CIRCUIT_GOALS,
  type Circuit,
  type CircuitGoal,
} from '@/lib/circuit';

// The COMPOSITION tier ("Bygg en krets", §7). Web components don't render in the test env, so these
// unit-test the PURE logic only: the rule-based validate(), the snap/combine (series-sum) model, the
// scenario registry, and θ-inertness. Same "the scene is the answer key" shape as modelling.test.

const combine = goalById('series_320')!;
const loop = goalById('close_loop')!;
const flip = goalById('flip_led')!;

describe('validate — rule-based topology, the scene is the answer key', () => {
  it('an incomplete loop (open ring) does not light', () => {
    const open: Circuit = { ...loop.solution, closed: false };
    const j = validate(loop, open);
    expect(j.ok).toBe(false);
    expect(j.verdict).toBe('open');
  });

  it('a missing battery does not light', () => {
    const noBatt: Circuit = { placed: ['r220', 'led'], ledForward: true, closed: true };
    const j = validate(loop, noBatt);
    expect(j.ok).toBe(false);
    expect(j.verdict).toBe('open');
  });

  it('a reversed LED does not light (polarity)', () => {
    const reversed: Circuit = { ...flip.solution, ledForward: false };
    const j = validate(flip, reversed);
    expect(j.ok).toBe(false);
    expect(j.verdict).toBe('reversed');
  });

  it('no current-limiting resistor does not light', () => {
    const noR: Circuit = { placed: ['batt', 'led'], ledForward: true, closed: true };
    const j = validate(loop, noR);
    expect(j.ok).toBe(false);
    expect(j.verdict).toBe('no_resistor');
  });

  it('the correct series sum (100 + 220 = 320) lights', () => {
    const good: Circuit = { placed: ['batt', 'r100', 'r220', 'led'], ledForward: true, closed: true };
    const j = validate(combine, good);
    expect(j.ok).toBe(true);
    expect(j.verdict).toBe('lit');
  });

  it('a wrong series sum does not light and reports the shortfall', () => {
    const wrong: Circuit = { placed: ['batt', 'r120', 'r100', 'led'], ledForward: true, closed: true }; // 220 ≠ 320
    const j = validate(combine, wrong);
    expect(j.ok).toBe(false);
    expect(j.verdict).toBe('wrong_sum');
    expect(j.message).toContain('220');
    expect(j.message).toContain('320');
  });

  it('each authored goal is solved by its own solution', () => {
    for (const g of CIRCUIT_GOALS) {
      const j = validate(g, g.solution);
      expect(j.ok, g.id).toBe(true);
      expect(j.verdict, g.id).toBe('lit');
    }
  });

  it('every verdict is non-punitive — no red X and no correct/wrong grade mark', () => {
    const messages = [
      validate(loop, { ...loop.solution, closed: false }).message,
      validate(flip, { ...flip.solution, ledForward: false }).message,
      validate(combine, { placed: ['batt', 'r120', 'led'], ledForward: true, closed: true }).message,
    ];
    for (const m of messages) {
      // A miss describes the SCENE ("does it light?"), never marks the child. No red-X glyphs, no
      // "Rätt!/Fel!" grade exclamation. ("fel håll" — wrong way round — is scene prose, allowed.)
      expect(m).not.toMatch(/✗|✘|❌|×/);
      expect(m).not.toMatch(/\b(Rätt|Fel)\s*!/i);
    }
  });
});

describe('seriesSum — the snap/combine model (two resistors add up)', () => {
  it('sums every placed resistor, ignoring battery and led', () => {
    const c: Circuit = { placed: ['batt', 'r100', 'r220', 'led'], ledForward: true, closed: true };
    expect(seriesSum(combine, c)).toBe(320);
  });
  it('a single resistor is just its own value', () => {
    expect(seriesSum(loop, loop.solution)).toBe(220);
  });
  it('an empty loop sums to 0', () => {
    expect(seriesSum(combine, { placed: [], ledForward: true, closed: true })).toBe(0);
  });
  it('hasKind / placedParts resolve tray ids', () => {
    expect(hasKind(loop, loop.solution, 'battery')).toBe(true);
    expect(hasKind(loop, loop.solution, 'led')).toBe(true);
    expect(placedParts(loop, loop.solution).map((p) => p.kind)).toEqual(['battery', 'resistor', 'led']);
  });
});

describe('scenario registry integrity', () => {
  it('exactly the three authored puzzles, each spending a real electronics skill', () => {
    const ids = CIRCUIT_GOALS.map((g) => g.id);
    expect(ids).toEqual(['series_320', 'close_loop', 'flip_led']);
    const spends = CIRCUIT_GOALS.map((g) => g.spends);
    expect(spends).toEqual(['elec_resistor_pick', 'elec_loop', 'elec_polarity']);
  });

  it('goalById round-trips and is undefined for an unknown id', () => {
    for (const g of CIRCUIT_GOALS) expect(goalById(g.id)).toBe(g);
    expect(goalById('nope')).toBeUndefined();
  });

  it('every goal has a battery + led in its tray and a solvable solution', () => {
    for (const g of CIRCUIT_GOALS) {
      expect(g.tray.some((p) => p.kind === 'battery'), g.id).toBe(true);
      expect(g.tray.some((p) => p.kind === 'led'), g.id).toBe(true);
      // the solution references only tray part ids
      const ids = new Set(g.tray.map((p) => p.id));
      for (const id of g.solution.placed) expect(ids.has(id), `${g.id}:${id}`).toBe(true);
    }
  });

  it('the combine target is reachable from the tray (a real pairing sums to it)', () => {
    const g = combine;
    const rs = g.tray.filter((p) => p.kind === 'resistor').map((p) => p.ohms ?? 0);
    const pairs = rs.flatMap((a, i) => rs.slice(i + 1).map((b) => a + b));
    expect(pairs).toContain(g.targetOhms);
  });
});

describe('θ-INERT — the composition tier writes no attempt/ability/θ', () => {
  // Like modelling.ts, circuit.ts is PURE logic: it must never import the db/repo/ledger or the
  // server, so running the stage logic cannot touch θ. A source scan proves the boundary (the DOM of
  // the wokwi elements is out of scope for the test env; the pure logic is what could ever write).
  it('circuit.ts imports nothing that could write to the ledger/θ', () => {
    const raw = readFileSync(path.join(process.cwd(), 'src/lib/circuit.ts'), 'utf8');
    // Strip comments first — they legitimately mention θ/attempt/db/repo to EXPLAIN the boundary;
    // what matters is that nothing writey is actually imported or required in the CODE.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const imports = code.split('\n').filter((l) => /^\s*import\b/.test(l));
    expect(imports).toHaveLength(0); // circuit.ts is self-contained pure logic — imports nothing
    expect(code).not.toMatch(/from ['"]server-only['"]/);
    expect(code).not.toMatch(/require\(|@\/db|db\/repo|@\/lib\/(repo|selector|practice|grade)/);
  });

  it('validate() is a pure function — same input, same output, no mutation of the circuit', () => {
    const g: CircuitGoal = combine;
    const c: Circuit = { placed: ['batt', 'r100', 'r220', 'led'], ledForward: true, closed: true };
    const snapshot = JSON.parse(JSON.stringify(c));
    const a = validate(g, c);
    const b = validate(g, c);
    expect(a).toEqual(b);
    expect(c).toEqual(snapshot); // the input was not mutated
  });
});
