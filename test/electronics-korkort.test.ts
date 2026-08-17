import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-korkort-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { replay } from '@/db/replay';
import {
  KORKORT,
  KORKORT_BY_ID,
  korkortState,
  todoKorkort,
  type FluencyOf,
} from '@/lib/electronics-korkort';
import { SLICE1_SKILL_PREREQS } from '@/lib/electronics-builds';
import { korkortStatuses, shelfKorkort, newlyTodoKorkort, korkortEarnedByCapability, confirmBuildComplete, confirmCapability } from '@/lib/electronics';
import { __setFluentMeasuredLookup } from '@/lib/electronics-fluency-seam';

const NOW = Date.UTC(2026, 7, 17);
const TRE = KORKORT_BY_ID.get('tre_volt')!;

// The typed (sprintable) electronics codes; the rest (loop/polarity/id_parts/symbol/breadboard) are
// choice, so `measured` is unreachable for them and their bar is `fluent && met`.
const MEASURABLE = new Set(['elec_resistor_pick', 'elec_colour_value']);
const FEM = KORKORT_BY_ID.get('fem_volt')!;

// A stub FluencyOf where `codes` are DEMONSTRATED: a typed code reaches fluent+measured, a choice code
// reaches fluent+met (the strongest a tap can show). Everything else is not fluent.
function demonstrated(codes: Set<string>): FluencyOf {
  return (code) => {
    const measurable = MEASURABLE.has(code);
    const on = codes.has(code);
    return { fluent: on, measured: on && measurable, met: on, measurable };
  };
}

describe('körkort state derivation (pure, θ-inert)', () => {
  it('LOCKED when a fluencyRequire is not fluent', () => {
    const f: FluencyOf = (code) => ({ fluent: code === 'elec_loop', measured: false, met: true, measurable: false });
    expect(korkortState(TRE, f, new Set())).toBe('locked'); // elec_polarity not fluent
  });

  it('a CHOICE prerequisite needs fluent && MET — a grade-seed (fluent but never attempted) is not enough', () => {
    // loop/polarity never sprint, so `measured` is unreachable; the seeded≠demonstrated guard is `met`.
    const seedOnly: FluencyOf = () => ({ fluent: true, measured: false, met: false, measurable: false });
    expect(korkortState(TRE, seedOnly, new Set())).toBe('locked');
  });

  it('TODO once its CHOICE prerequisites are fluent && met (measured is unreachable for a tap)', () => {
    expect(korkortState(TRE, demonstrated(new Set(TRE.fluencyRequires)), new Set())).toBe('todo');
  });

  it('a MEASURABLE (typed) prerequisite needs fluent && MEASURED — fluent+met alone is not enough', () => {
    // fem_volt has typed skills (resistor_pick, colour_value); fluent+met but provisional ⇒ LOCKED.
    const metNotMeasured: FluencyOf = (code) => ({ fluent: true, measured: false, met: true, measurable: MEASURABLE.has(code) });
    expect(korkortState(FEM, metNotMeasured, new Set())).toBe('locked');
    // Typed skills measured + breadboard (choice) met ⇒ TODO.
    expect(korkortState(FEM, demonstrated(new Set(FEM.fluencyRequires)), new Set())).toBe('todo');
  });

  it('EARNED once the granted capability is owned (derives purely from the capability fact)', () => {
    expect(korkortState(TRE, demonstrated(new Set(TRE.fluencyRequires)), new Set([TRE.grants]))).toBe('earned');
  });

  it('EARNED wins even if fluency data later regresses', () => {
    expect(korkortState(TRE, demonstrated(new Set()), new Set([TRE.grants]))).toBe('earned');
  });

  it('todoKorkort lists exactly the ready-but-unearned körkort', () => {
    const f = demonstrated(new Set(TRE.fluencyRequires));
    expect(todoKorkort(f, new Set()).map((k) => k.id)).toEqual(['tre_volt']);
    // Grant it → it drops off the todo list (now earned).
    expect(todoKorkort(f, new Set([TRE.grants])).map((k) => k.id)).toEqual([]);
  });
});

describe('körkort registry references only real skill codes', () => {
  it('every fluencyRequires code is one of the fixed 8-skill electronics contract', () => {
    const contract = new Set<string>(SLICE1_SKILL_PREREQS);
    for (const k of KORKORT) {
      for (const code of k.fluencyRequires) {
        expect(contract.has(code)).toBe(true);
      }
    }
  });

  it('each körkort grants a distinct elec_cap_tier_* capability', () => {
    const grants = KORKORT.map((k) => k.grants);
    expect(new Set(grants).size).toBe(grants.length); // no duplicate grants
    for (const g of grants) expect(g).toMatch(/^elec_cap_tier_/);
  });

  it('korkortEarnedByCapability maps a granted capability back to its körkort', () => {
    expect(korkortEarnedByCapability('elec_cap_tier_3v')?.id).toBe('tre_volt');
    expect(korkortEarnedByCapability('elec_cap_tier_5v')?.id).toBe('fem_volt');
    expect(korkortEarnedByCapability('elec_cap_owns_breadboard')).toBeNull();
  });
});

describe('körkort layer is θ-INERT by construction (grep proof)', () => {
  it('electronics-korkort.ts imports no selector / θ / gate / ledger', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/lib/electronics-korkort.ts'), 'utf8');
    const imports = src.split('\n').filter((l) => /^\s*import\b/.test(l));
    const forbidden = /selector|theta|\btheta\b|θ|\bgate\b|ledger|\/practice|abilities|attempt/i;
    for (const line of imports) {
      expect(forbidden.test(line), `forbidden engine import: ${line}`).toBe(false);
    }
  });
});

// ── The consumer wiring (electronics.ts) against a real DB + the fluent-measured seam ────────────
describe('körkort wiring: statuses, shelf, phase-1 reveal', () => {
  let pid: string;

  beforeEach(() => {
    const fam = repo.createFamily(`k-${Math.random().toString(36).slice(2)}`, 'x:y', 'x:z', NOW);
    pid = repo.createPlayer(fam, 'mouse', 3, NOW);
    replay(pid);
    // Default: all of tre_volt's requirements demonstrated. loop/polarity are CHOICE (not measurable),
    // so demonstrated = fluent && met.
    __setFluentMeasuredLookup((_p, code) => {
      const on = new Set<string>(TRE.fluencyRequires).has(code);
      return { fluent: on, measured: false, met: on, measurable: false };
    });
  });
  afterEach(() => {
    __setFluentMeasuredLookup(null); // restore real wiring
  });

  it('korkortStatuses reports tre_volt TODO and fem_volt LOCKED', () => {
    const st = korkortStatuses(pid);
    expect(st.find((k) => k.id === 'tre_volt')!.state).toBe('todo');
    expect(st.find((k) => k.id === 'fem_volt')!.state).toBe('locked');
  });

  it('shelfKorkort hides LOCKED körkort, shows TODO + EARNED', () => {
    expect(shelfKorkort(pid).map((k) => k.id)).toEqual(['tre_volt']); // only the todo
  });

  it('granting the tier capability flips the körkort to EARNED on the shelf (no new record)', () => {
    confirmCapability(pid, 'elec_cap_tier_3v', NOW); // stand-in for the build-approval grant
    const shelf = shelfKorkort(pid);
    expect(shelf.find((k) => k.id === 'tre_volt')!.state).toBe('earned');
  });

  it('completing the coin build (which grants elec_cap_tier_3v) earns the tre_volt körkort', () => {
    confirmBuildComplete(pid, 'build_light_led_coin', NOW); // grants elec_cap_tier_3v
    expect(korkortStatuses(pid).find((k) => k.id === 'tre_volt')!.state).toBe('earned');
  });

  it('phase-1 reveal fires only when a fluencyRequire crossed THIS session and it is now TODO', () => {
    // A crossing in one of tre_volt's requirements this session → reveal.
    expect(newlyTodoKorkort(pid, ['elec_polarity'])).toEqual(['3 volt']);
    // A crossing unrelated to any körkort → no reveal.
    expect(newlyTodoKorkort(pid, ['add_within_10'])).toEqual([]);
    // No crossings at all → no reveal.
    expect(newlyTodoKorkort(pid, [])).toEqual([]);
  });

  it('an already-EARNED körkort does not re-reveal', () => {
    confirmCapability(pid, 'elec_cap_tier_3v', NOW);
    expect(newlyTodoKorkort(pid, ['elec_polarity'])).toEqual([]); // earned, no longer todo
  });
});
