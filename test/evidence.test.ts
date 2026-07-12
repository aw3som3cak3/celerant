import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-evidence-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import { getDb } from '@/db';
import * as repo from '@/db/repo';
import { nextItem, answer, __peekPendingAnswer } from '@/lib/practice';
import { PROBE_SETS, gradeProbe } from '@/lib/probes';
import { seedPrereg } from '@/db/prereg-seed';

const NOW = Date.now(); // real time, so probe rows postdate the boot-seeded prereg
let familyId: string;
let pid: string;

function snapshotAbility(who: string): string {
  return JSON.stringify(
    getDb().prepare('SELECT skill_code, theta, rd, volatility, n_obs, last_seen_at, rate, rate_state FROM ability WHERE player_id = ? ORDER BY skill_code').all(who),
  );
}

beforeAll(() => {
  getDb(); // triggers prereg seeding
  familyId = repo.createFamily('fox+hotdog', 'x:y', 'x:z', NOW);
  pid = repo.createPlayer(familyId, 'fox', 3, NOW);
  let now = NOW + 1000;
  for (let i = 0; i < 20; i++) {
    const it = nextItem(pid, 3, now);
    answer(pid, it.itemId, __peekPendingAnswer(it.itemId)!, false, now);
    now += 60_000;
  }
});

describe('probes.ts items are self-consistent (§6, §2.2)', () => {
  const norm = (s: string) => s.replace(/−/g, '-').replace(/×/g, '*').replace(/□/g, 'x').replace(/=$/, '').trim();
  const ev = (e: string) => Function(`"use strict"; return (${e});`)();
  for (const [set, items] of Object.entries(PROBE_SETS)) {
    it(`${set}: every item substitutes true and grades correctly`, () => {
      for (const item of items) {
        const p = norm(item.prompt);
        if (p.includes('=')) {
          const [l, r] = p.split('=');
          const v = Number(item.answer);
          const sub = (side: string) => ev(side.replace(/(\d)\s*x/g, `$1*(${v})`).replace(/(?<![\d)])x/g, `(${v})`).replace(/(\d)\s*\(/g, '$1*('));
          expect(Math.abs(sub(l) - sub(r)), `${item.ref} "${item.prompt}" x=${v}`).toBeLessThan(1e-9);
        } else {
          expect(ev(p.replace(/(\d)\s*\(/g, '$1*(')), `${item.ref} "${item.prompt}"`).toBe(Number(item.answer));
        }
        expect(gradeProbe(set, item.ref, item.answer)!.correct, `${item.ref} grades its own answer correct`).toBe(1);
      }
    });
  }
});

describe('the probe is a clean ruler — no model path reads it (§2.1, §6)', () => {
  it('replay(), the selector and the θ update never name probe or prereg', () => {
    for (const f of ['src/db/replay.ts', 'src/lib/selector.ts', 'src/model/elo.ts']) {
      const src = readFileSync(path.join(process.cwd(), f), 'utf8').toLowerCase();
      expect(src.includes('probe'), `${f} references probe`).toBe(false);
      expect(src.includes('prereg'), `${f} references prereg`).toBe(false);
    }
  });

  it('dropping probe / prereg / goal_event / usage_event changes no ability (§6, motivation §5)', () => {
    // give the player a probe row and resolve a thesis, then drop everything
    repo.appendProbe({ playerId: pid, probeSet: 'arith_v1', itemRef: 'a01', featuresJson: '{}', given: '59', correct: 1, latencyMs: 3000, at: NOW + 5_000_000, isBaseline: true, probeVersion: 1 });
    repo.appendUsageEvent(pid, 'session_started', null, NOW + 5_000_001);
    const before = snapshotAbility(pid);
    const db = getDb();
    db.prepare('DELETE FROM probe WHERE player_id = ?').run(pid);
    db.prepare('DELETE FROM prereg').run();
    db.prepare('DELETE FROM goal_event').run();
    db.prepare('DELETE FROM usage_event WHERE player_id = ?').run(pid);
    expect(snapshotAbility(pid)).toBe(before);
  });
});

describe('pre-registration (§3, §6)', () => {
  it('the six theses seed once and idempotently, with a null outcome', () => {
    const db = getDb();
    db.prepare('DELETE FROM prereg').run();
    seedPrereg(db, NOW);
    expect(repo.preregRows().map((r) => r.thesis_id).sort()).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6']);
    seedPrereg(db, NOW + 999); // idempotent — no duplicate rows, no re-stamp
    expect(repo.preregRows().length).toBe(6);
    expect(repo.preregRows().every((r) => r.outcome === null)).toBe(true);
  });

  it('a thesis cannot be confirmed with evidence predating its registration (§6)', () => {
    const db = getDb();
    db.prepare('DELETE FROM prereg').run();
    db.prepare('DELETE FROM probe').run();
    const reg = NOW;
    db.prepare('INSERT INTO prereg (thesis_id, statement, measure, threshold, registered_at) VALUES (?,?,?,?,?)').run('TX', 's', 'm', 't', reg);

    // a probe AFTER registration -> confirm allowed
    repo.appendProbe({ playerId: pid, probeSet: 'arith_v1', itemRef: 'a01', featuresJson: '{}', given: '59', correct: 1, latencyMs: 100, at: reg + 1000, isBaseline: false, probeVersion: 1 });
    expect(repo.resolveThesis('TX', 'confirmed', reg + 2000).ok).toBe(true);

    // a probe BEFORE registration -> confirm refused as inadmissible
    db.prepare('UPDATE prereg SET outcome = NULL, resolved_at = NULL WHERE thesis_id = ?').run('TX');
    repo.appendProbe({ playerId: pid, probeSet: 'arith_v1', itemRef: 'a02', featuresJson: '{}', given: '75', correct: 1, latencyMs: 100, at: reg - 1000, isBaseline: false, probeVersion: 1 });
    const res = repo.resolveThesis('TX', 'confirmed', reg + 3000);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('evidence_predates_registration');
  });
});

describe('baseline administration (§2.3, §6)', () => {
  it('a fresh player has no baseline probe until one is recorded', () => {
    const p2 = repo.createPlayer(familyId, 'owl', 2, NOW);
    expect(repo.hasBaselineProbe(p2)).toBe(false);
    repo.appendProbe({ playerId: p2, probeSet: 'arith_v1', itemRef: 'a01', featuresJson: '{}', given: '59', correct: 1, latencyMs: 2000, at: NOW, isBaseline: true, probeVersion: 1 });
    expect(repo.hasBaselineProbe(p2)).toBe(true);
  });
});
