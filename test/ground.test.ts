import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-ground-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { structureOf, buildScene, sceneResult, scoreChoice, GROUND_ITEMS, buildGroundItem, gradeGround, conceptKey, RUN_STAGES } from '@/lib/ground';
import { groundedStructure, grounded, canGround, GROUND_WINDOW, GROUND_THRESHOLD } from '@/lib/ground-gate';
import { computeUnlocked, type SelState } from '@/lib/selector';

const NOW = Date.UTC(2026, 6, 21);

describe('GROUND scene contract (pure, shared client/server)', () => {
  it('maps families to the meaning: add→combine, sub→separate, else grounded-by-default', () => {
    expect(structureOf('add_within_10')).toBe('combine');
    expect(structureOf('add_2d_carry')).toBe('combine');
    expect(structureOf('sub_within_10')).toBe('separate');
    expect(structureOf('mult_table_5')).toBeNull();
    expect(structureOf('missing_addend_10')).toBeNull(); // family 'missing' — not gated
  });

  it('buildScene is deterministic and stays in kid-countable bounds', () => {
    for (let seed = 1; seed < 300; seed++) {
      const s = buildScene(seed);
      expect(buildScene(seed)).toEqual(s); // same seed → same scene
      const result = sceneResult(s);
      if (s.structure === 'combine') expect(s.a + s.b).toBeLessThanOrEqual(9);
      else expect(result).toBeGreaterThanOrEqual(1); // separate always leaves ≥ 1
      expect(result).toBeGreaterThan(0);
    }
  });

  it('scoreChoice grades from the seed, not the client', () => {
    const s = buildScene(42);
    expect(scoreChoice(42, s.structure)).toBe(true);
    expect(scoreChoice(42, s.structure === 'combine' ? 'separate' : 'combine')).toBe(false);
  });
});

describe('GROUND acquisition ladder (structure → count → numeral → sum)', () => {
  it('a run climbs the rungs and GROUND_ITEMS matches', () => {
    expect(RUN_STAGES[0]).toBe('structure');
    expect(RUN_STAGES.at(-1)).toBe('sum'); // ends at the bridge into symbolic add
    expect(GROUND_ITEMS).toBe(RUN_STAGES.length);
  });

  it('items are deterministic and well-formed at every rung', () => {
    for (let seed = 1; seed < 400; seed++) {
      for (const stage of ['structure', 'count', 'numeral', 'sum'] as const) {
        const it = buildGroundItem(seed, stage);
        expect(buildGroundItem(seed, stage)).toEqual(it); // same seed+stage → same item
        if (it.stage === 'structure') continue;
        // choice rungs: 4 distinct options, in [1,10], one of them the answer
        expect(it.options.length).toBe(4);
        expect(new Set(it.options).size).toBe(4);
        for (const o of it.options) { expect(o).toBeGreaterThanOrEqual(1); expect(o).toBeLessThanOrEqual(10); }
        expect(it.options).toContain(it.answer);
        // the answer really is the pictured amount
        if (it.prompt.type === 'group') expect(it.answer).toBe(it.prompt.a);
        else { expect(it.answer).toBe(it.prompt.a + it.prompt.b); expect(it.answer).toBeLessThanOrEqual(10); }
        // count shows picture-groups; numeral/sum show digits
        expect(it.optionType).toBe(stage === 'count' ? 'group' : 'numeral');
      }
    }
  });

  it('gradeGround re-derives the answer from seed + stage', () => {
    for (const stage of ['count', 'numeral', 'sum'] as const) {
      const it = buildGroundItem(7, stage);
      if (it.stage === 'structure') continue;
      expect(gradeGround(7, stage, it.answer)).toBe(true);
      const wrong = it.options.find((o) => o !== it.answer)!;
      expect(gradeGround(7, stage, wrong)).toBe(false);
    }
    const s = buildGroundItem(7, 'structure');
    if (s.stage === 'structure') expect(gradeGround(7, 'structure', s.structure)).toBe(true);
  });

  it('conceptKey feeds combine/separate to the gate, higher rungs record under their stage', () => {
    const s = buildGroundItem(7, 'structure');
    if (s.stage === 'structure') expect(conceptKey(s)).toBe(s.structure); // 'combine' | 'separate'
    expect(conceptKey(buildGroundItem(7, 'count'))).toBe('count');
    expect(conceptKey(buildGroundItem(7, 'numeral'))).toBe('numeral');
    expect(conceptKey(buildGroundItem(7, 'sum'))).toBe('sum');
  });
});

describe('grounded criterion (shadow — computed, never enforced)', () => {
  let pid: string;
  beforeAll(() => {
    const fam = repo.createFamily('cat+dog', 'a:b', 'a:c', NOW);
    pid = repo.createPlayer(fam, 'cat', 1, NOW); // åk1 — GROUND's audience
  });

  const record = (structure: 'combine' | 'separate', correct: boolean, at: number) =>
    repo.appendGroundEvent(pid, structure, '{}', correct ? structure : 'x', correct, at);

  it('needs a full window; ≥ threshold correct of the last window passes', () => {
    expect(groundedStructure(pid, 'combine')).toBe(false); // no evidence
    // 4 correct + 1 wrong = 5 events (< window) → still not grounded
    for (let i = 0; i < 4; i++) record('combine', true, NOW + i);
    record('combine', false, NOW + 5);
    expect(repo.recentGroundChoices(pid, 'combine', GROUND_WINDOW).length).toBeLessThan(GROUND_WINDOW);
    expect(groundedStructure(pid, 'combine')).toBe(false);

    // one more correct → 6 events, 5 correct ⇒ ≥ threshold ⇒ grounded
    record('combine', true, NOW + 6);
    expect(groundedStructure(pid, 'combine')).toBe(true);
    expect(GROUND_THRESHOLD).toBeLessThanOrEqual(GROUND_WINDOW);
  });

  it('grounded() gates only add/sub; everything else is grounded by default', () => {
    // combine is grounded (above); separate has no evidence
    expect(grounded(pid, 'add_within_10')).toBe(true); // combine grounded
    expect(grounded(pid, 'sub_within_10')).toBe(false); // separate not yet
    expect(grounded(pid, 'mult_table_5')).toBe(true); // not a GROUND family → default true
  });

  it('canGround targets the youngest and does NOT retire once grounded (stays replayable)', () => {
    const fam = repo.createFamily('fox+owl', 'f:o', 'f:x', NOW);
    const young = repo.createPlayer(fam, 'fox', 1, NOW);
    const older = repo.createPlayer(fam, 'owl', 4, NOW);
    expect(canGround(young)).toBe(true); // åk1, in the audience
    expect(canGround(older)).toBe(false); // too old for the door
    // grounding BOTH structures must NOT remove the door — a kid who aced it can
    // still go back (punish-for-mastery is exactly what we avoid).
    for (let i = 0; i < GROUND_WINDOW; i++) {
      repo.appendGroundEvent(young, 'combine', '{}', 'combine', true, NOW + i);
      repo.appendGroundEvent(young, 'separate', '{}', 'separate', true, NOW + 100 + i);
    }
    expect(canGround(young)).toBe(true);
  });
});

describe('the Level-3 seam is present but DISABLED (drill is byte-for-byte unchanged)', () => {
  const base: SelState = {
    code: 'add_within_10', family: 'add', year: 1, mode: 'component', skillId: 1,
    theta: 1, lastSeenAt: null, requires: [], rate: { source: 'unknown' }, aim: null,
  };
  const states = [base];

  it('the default predicate unlocks exactly as always (no gating)', () => {
    expect(computeUnlocked(states).get('add_within_10')).toBe(true);
    expect(computeUnlocked(states, () => true).get('add_within_10')).toBe(true);
  });

  it('the seam CAN gate when a real predicate is passed (proving it is a live flip, just off)', () => {
    const gated = computeUnlocked(states, (code) => code !== 'add_within_10');
    expect(gated.get('add_within_10')).toBe(false);
  });
});

describe('run size stays small (must not compete with drill for session time)', () => {
  it('a GROUND run is a short batch', () => {
    expect(GROUND_ITEMS).toBeLessThanOrEqual(12);
  });
});
