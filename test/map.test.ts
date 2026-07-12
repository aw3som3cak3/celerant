import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-map-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import { getDb } from '@/db';
import * as repo from '@/db/repo';
import { nextItem, answer, __peekPendingAnswer, buildStates } from '@/lib/practice';
import { buildChildMap, buildParentMap, frontierCodes } from '@/lib/map';
import { positions } from '@/lib/graph';
import { computeUnlocked } from '@/lib/selector';
import { SKILLS } from '@/skills';

const NOW = Date.UTC(2026, 6, 10);
const SY = 3;
let familyId: string;
let pid: string;

function solveMany(who: string, sy: number, n: number, startAt: number): number {
  let now = startAt;
  for (let i = 0; i < n; i++) {
    const it = nextItem(who, sy, now);
    answer(who, it.itemId, __peekPendingAnswer(it.itemId)!, false, now);
    now += 60_000;
  }
  return now;
}

function reachSkill(who: string, sy: number, code: string, now: number): void {
  const it = nextItem(who, sy, now, { chosenCode: code });
  answer(who, it.itemId, __peekPendingAnswer(it.itemId)!, false, now);
}

// The reached / frontier / near sets, computed independently of map.ts, so the
// map is checked against a second implementation of the spec's own definitions.
function ringsIndependently(who: string, sy: number) {
  const reached = new Set(repo.cardsForPlayer(who).map((c) => c.skillCode));
  const unlocked = computeUnlocked(buildStates(who, sy));
  const frontier = new Set(
    SKILLS.filter((s) => (unlocked.get(s.code) ?? false) && !reached.has(s.code)).map((s) => s.code),
  );
  const near = new Set(
    SKILLS.filter(
      (s) =>
        !reached.has(s.code) &&
        !frontier.has(s.code) &&
        s.requires.length > 0 &&
        s.requires.every((r) => reached.has(r) || frontier.has(r)),
    ).map((s) => s.code),
  );
  return { reached, frontier, near };
}

function snapshotAbility(who: string): string {
  return JSON.stringify(
    getDb()
      .prepare('SELECT skill_code, theta, n_obs, last_seen_at, rate, rate_state FROM ability WHERE player_id = ? ORDER BY skill_code')
      .all(who),
  );
}

beforeAll(() => {
  familyId = repo.createFamily('fox+hotdog', 'x:y', 'x:z', NOW);
  pid = repo.createPlayer(familyId, 'fox', SY, NOW);
  solveMany(pid, SY, 60, NOW + 1000); // cross a chunk of territory
});

describe('the map — the three rings and the fog (the-map.md §2, §5, §8)', () => {
  it('child payload is exactly reached ∪ frontier ∪ near; fog is absent', () => {
    const map = buildChildMap(pid, SY);
    for (const n of map.nodes) expect(['reached', 'frontier', 'near']).toContain(n.state);

    const { reached, frontier, near } = ringsIndependently(pid, SY);
    expect(map.nodes.filter((n) => n.state === 'reached').length).toBe(reached.size);
    expect(map.nodes.filter((n) => n.state === 'frontier').length).toBe(frontier.size);
    expect(map.nodes.filter((n) => n.state === 'near').length).toBe(near.size);
    expect(map.nodes.length).toBe(reached.size + frontier.size + near.size);
    expect(map.nodes.length).toBeLessThan(SKILLS.length); // there IS fog
  });

  it('no fogged skill code appears anywhere in the child payload', () => {
    const map = buildChildMap(pid, SY);
    const { reached, frontier, near } = ringsIndependently(pid, SY);
    const shown = new Set([...reached, ...frontier, ...near]);
    const blob = JSON.stringify(map);
    for (const s of SKILLS) if (!shown.has(s.code)) expect(blob).not.toContain(`"${s.code}"`);
  });

  it('silhouettes carry no identity — only id/x/y/state (§2)', () => {
    const map = buildChildMap(pid, SY);
    const nears = map.nodes.filter((n) => n.state === 'near');
    expect(nears.length).toBeGreaterThan(0);
    for (const n of nears) {
      expect(Object.keys(n).sort()).toEqual(['id', 'state', 'x', 'y']);
      expect(n.id.startsWith('near:')).toBe(true);
    }
  });

  it('child payload has no count, percentage or distance (§5)', () => {
    const map = buildChildMap(pid, SY);
    const keys = new Set<string>();
    const walk = (o: unknown) => {
      if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) (keys.add(k), walk(v));
    };
    walk(map);
    for (const bad of ['total', 'percent', 'percentage', 'complete', 'completion', 'distance', 'remaining', 'progress', 'eta', 'count'])
      expect(keys.has(bad)).toBe(false);
  });

  it('the frontier equals the chooser query — unlockable and not yet reached (§8)', () => {
    const { frontier } = ringsIndependently(pid, SY);
    expect(frontierCodes(pid, SY)).toEqual(frontier);
    const mapFrontier = new Set(buildChildMap(pid, SY).nodes.filter((n) => n.state === 'frontier').map((n) => n.id));
    expect(mapFrontier).toEqual(frontier);
  });

  it('positions are graph-only and stable when a node moves frontier → reached (§8)', () => {
    const before = JSON.stringify([...positions()]);
    const p = repo.createPlayer(familyId, 'bear', SY, NOW);
    solveMany(p, SY, 20, NOW + 5_000_000);
    const m1 = buildChildMap(p, SY);
    const f = m1.nodes.find((n) => n.state === 'frontier')!;
    expect(f).toBeTruthy();
    const posBefore = `${f.x},${f.y}`;
    reachSkill(p, SY, f.id, NOW + 6_000_000);
    const same = buildChildMap(p, SY).nodes.find((n) => n.id === f.id)!;
    expect(same.state).toBe('reached');
    expect(`${same.x},${same.y}`).toBe(posBefore);
    expect(JSON.stringify([...positions()])).toBe(before); // graph layout never shifted
  });

  it('reaching one frontier node adds exactly that node to reached (§8)', () => {
    const p = repo.createPlayer(familyId, 'owl', SY, NOW);
    solveMany(p, SY, 20, NOW + 7_000_000);
    const before = new Set(buildChildMap(p, SY).nodes.filter((n) => n.state === 'reached').map((n) => n.id));
    const f = buildChildMap(p, SY).nodes.find((n) => n.state === 'frontier')!;
    reachSkill(p, SY, f.id, NOW + 8_000_000);
    const after = new Set(buildChildMap(p, SY).nodes.filter((n) => n.state === 'reached').map((n) => n.id));
    expect([...after].filter((c) => !before.has(c))).toEqual([f.id]); // exactly one new
    for (const c of before) expect(after.has(c)).toBe(true); // none regressed
  });

  it('parent map has all 77 nodes; the child map never does (§6)', () => {
    const p = repo.createPlayer(familyId, 'cat', SY, NOW);
    solveMany(p, SY, 20, NOW + 9_000_000);
    expect(buildParentMap(p).nodes.length).toBe(SKILLS.length);
    expect(buildChildMap(p, SY).nodes.length).toBeLessThan(SKILLS.length);
  });

  it('dropping the card table blanks the map and changes no θ (§8, motivation §5)', () => {
    const p = repo.createPlayer(familyId, 'seal', SY, NOW);
    solveMany(p, SY, 25, NOW + 11_000_000);
    expect(buildChildMap(p, SY).nodes.some((n) => n.state === 'reached')).toBe(true);
    const abilityBefore = snapshotAbility(p);
    getDb().prepare('DELETE FROM card WHERE player_id = ?').run(p);
    expect(buildChildMap(p, SY).nodes.filter((n) => n.state === 'reached').length).toBe(0);
    expect(snapshotAbility(p)).toBe(abilityBefore);
  });
});
