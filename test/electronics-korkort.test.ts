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

// A stub fluency lookup for the PURE derivation: fluent && measured only for the given code set.
function fluencyOf(fluentMeasured: Set<string>): FluencyOf {
  return (code) => ({ fluent: fluentMeasured.has(code), measured: fluentMeasured.has(code) });
}

describe('körkort state derivation (pure, θ-inert)', () => {
  it('LOCKED when a fluencyRequire is only met, not fluent', () => {
    // elec_loop fluent+measured, but elec_polarity NOT fluent (merely met on the couch).
    const f: FluencyOf = (code) => ({ fluent: code === 'elec_loop', measured: code === 'elec_loop' });
    expect(korkortState(TRE, f, new Set())).toBe('locked');
  });

  it('LOCKED when fluent but the rate is only provisional (not measured)', () => {
    // The whole point: fluent on screen is not enough — the bench needs a MEASURED rate.
    const f: FluencyOf = () => ({ fluent: true, measured: false });
    expect(korkortState(TRE, f, new Set())).toBe('locked');
  });

  it('TODO when every fluencyRequire is fluent && measured and the capability is not yet granted', () => {
    const f = fluencyOf(new Set(TRE.fluencyRequires));
    expect(korkortState(TRE, f, new Set())).toBe('todo');
  });

  it('EARNED once the granted capability is owned (derives purely from the capability fact)', () => {
    const f = fluencyOf(new Set(TRE.fluencyRequires));
    expect(korkortState(TRE, f, new Set([TRE.grants]))).toBe('earned');
  });

  it('EARNED wins even if fluency data later regresses', () => {
    const f = fluencyOf(new Set()); // nothing fluent anymore
    expect(korkortState(TRE, f, new Set([TRE.grants]))).toBe('earned');
  });

  it('todoKorkort lists exactly the ready-but-unearned körkort', () => {
    const f = fluencyOf(new Set(TRE.fluencyRequires));
    const todo = todoKorkort(f, new Set());
    expect(todo.map((k) => k.id)).toEqual(['tre_volt']);
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
    // Default: all of tre_volt's requirements fluent && measured; nothing else.
    __setFluentMeasuredLookup((_p, code) => {
      const on = new Set<string>(TRE.fluencyRequires);
      return { fluent: on.has(code), measured: on.has(code) };
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
