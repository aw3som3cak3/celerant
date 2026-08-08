import { describe, it, expect, beforeAll, vi } from 'vitest';

// THE ANTI-CONTAMINATION GATE (spelling increment 3). Inject a throwaway spelling skill
// (NOT real content, NOT in the shipped SKILLS) via vi.mock, then prove every subject-scoped
// site isolates: a maths flow never surfaces the spelling fixture, and vice versa. The mock
// lives here — importing SKILLS through mocked '@/skills' reaches every consuming module; a
// helper inside skills.ts would close over the real array and dodge the mock. The fixture's
// family is namespaced ('sp_test') so it can never straddle a maths family.
vi.mock('@/skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/skills')>();
  // 'sp_test_word' inlined (vi.mock is hoisted above any top-level const, so the factory
  // can't reference one). The test body uses the FIXTURE_CODE const below.
  const FIXTURE = {
    code: 'sp_test_word', family: 'sp_test', subject: 'spelling', format: 'numpad',
    year: 0, mode: 'component', sprintable: true, requires: [],
    generate: () => ({ prompt: '', answer: { kind: 'word', text: 'sol' }, steps: ['sol'] }),
  } as unknown as (typeof actual.SKILLS)[number];
  const SKILLS = [...actual.SKILLS, FIXTURE];
  const BY_CODE = new Map(SKILLS.map((s) => [s.code, s]));
  // Delegate real skills to the real generator; stub the fixture (skills.ts's own
  // generateCanon closes over the real BY_CODE and can't see the fixture).
  const generateCanon = (code: string, r: import('@/skills').Rng) =>
    code === 'sp_test_word' ? { prompt: '', answer: 'sol', steps: ['sol'] } : actual.generateCanon(code, r);
  return { ...actual, SKILLS, BY_CODE, generateCanon };
});

const FIXTURE_CODE = 'sp_test_word';

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'celerant-scope-')), 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { computeAbility, replay } from '@/db/replay';
import { buildStates } from '@/lib/practice';
import { buildChildMap, buildParentMap, buildCardShelf } from '@/lib/map';
import { positions, skillEdges } from '@/lib/graph';
import { skillEligibility } from '@/lib/sprint-eligibility';
import { aimFor, letterAimFor } from '@/lib/fluency';
import { seedGradeFor } from '@/lib/onboarding';

const YEAR = 3;
let pid: string;
beforeAll(() => {
  const fam = repo.createFamily('ice_cream+turtle-scope', 'x:y', 'x:z', Date.UTC(2026, 7, 8));
  pid = repo.createPlayer(fam, 'mouse', YEAR, Date.UTC(2026, 7, 8));
  replay(pid); // seeds every skill (maths + the spelling fixture) under its own subject's units
});

describe('subject scoping — anti-contamination', () => {
  it('the replay seed applies each skill its OWN subject units (spelling ≠ digit-shaped)', () => {
    const cache = computeAbility(YEAR, null, [], []);
    const sg = seedGradeFor(YEAR);
    // Provisional factor, derived from a maths skill seeded at/above its year.
    const prov = cache.get('add_within_10')!.rate! / aimFor(null, sg, 'add_within_10', 0);
    const fx = cache.get(FIXTURE_CODE)!.rate!;
    expect(fx).toBeCloseTo(letterAimFor(sg, FIXTURE_CODE) * prov, 4); // seeded in LETTER units
    expect(fx).not.toBeCloseTo(aimFor(null, sg, FIXTURE_CODE, 0) * prov, 2); // NOT the digit aim
  });

  it('buildStates yields only the requested subject', () => {
    const maths = buildStates(pid, YEAR, 'maths').map((s) => s.code);
    const spelling = buildStates(pid, YEAR, 'spelling').map((s) => s.code);
    expect(maths).not.toContain(FIXTURE_CODE);
    expect(maths.length).toBeGreaterThan(30); // the real maths graph
    expect(spelling).toEqual([FIXTURE_CODE]); // only the fixture
  });

  it('the child map, parent map, graph layout and edges are per-subject', () => {
    expect(buildChildMap(pid, YEAR, 'maths').nodes.map((n) => n.id)).not.toContain(FIXTURE_CODE);
    expect(buildChildMap(pid, YEAR, 'spelling').nodes.map((n) => n.id)).toContain(FIXTURE_CODE);
    expect(buildParentMap(pid, 'maths').nodes.map((n) => n.code)).not.toContain(FIXTURE_CODE);
    expect(buildParentMap(pid, 'spelling').nodes.map((n) => n.code)).toEqual([FIXTURE_CODE]);
    expect([...positions('maths').keys()]).not.toContain(FIXTURE_CODE);
    expect([...positions('spelling').keys()]).toEqual([FIXTURE_CODE]);
    expect(skillEdges('maths').flatMap((e) => [e.from, e.to])).not.toContain(FIXTURE_CODE);
  });

  it('the card shelf is per-subject', () => {
    expect(buildCardShelf(pid, YEAR, 'maths').active.map((a) => a.node.code)).not.toContain(FIXTURE_CODE);
    expect(buildCardShelf(pid, YEAR, 'spelling').active.map((a) => a.node.code)).toContain(FIXTURE_CODE);
  });

  it('sprint eligibility is per-subject', () => {
    expect(skillEligibility(pid, 'maths').map((e) => e.code)).not.toContain(FIXTURE_CODE);
    expect(skillEligibility(pid, 'spelling').map((e) => e.code)).toContain(FIXTURE_CODE);
  });

  it('the transfer/applicationSignal never surfaces the other subject', () => {
    // Fresh player has no crossings, so both are empty — the point is the maths-scoped
    // computation never references the spelling fixture (and never pairs across subjects).
    expect(repo.applicationSignal(pid, 'maths').map((r) => r.component)).not.toContain(FIXTURE_CODE);
    expect(repo.applicationSignal(pid, 'spelling').map((r) => r.component)).not.toContain('add_within_10');
  });

  it('the fixture NEVER appears in ANY maths-scoped result', () => {
    const mathsResults = [
      ...buildStates(pid, YEAR, 'maths').map((s) => s.code),
      ...buildChildMap(pid, YEAR, 'maths').nodes.map((n) => n.id),
      ...buildParentMap(pid, 'maths').nodes.map((n) => n.code),
      ...[...positions('maths').keys()],
      ...skillEdges('maths').flatMap((e) => [e.from, e.to]),
      ...skillEligibility(pid, 'maths').map((e) => e.code),
      ...buildCardShelf(pid, YEAR, 'maths').active.map((a) => a.node.code),
      ...repo.applicationSignal(pid, 'maths').map((r) => r.component),
    ];
    expect(mathsResults).not.toContain(FIXTURE_CODE);
  });
});
