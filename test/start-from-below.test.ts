import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-sfb-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import { getDb } from '@/db';
import * as repo from '@/db/repo';
import { nextItem, answer, __peekPendingAnswer } from '@/lib/practice';
import { playerTarget, enteringGradeHint, rampTargetP, STEADY_TARGET, NEW_PLAYER_TARGET, SETTLE_SESSIONS, RAMP_FLOOR_P } from '@/lib/onboarding';
import { predict } from '@/model/elo';

const NOW = Date.UTC(2026, 8, 15); // September — after the school-year turnover
let familyId: string;

function pOfServed(itemId: string, playerId: string): number {
  const code = (getDb().prepare('SELECT skill_code FROM pending_item WHERE item_id = ?').get(itemId) as { skill_code: string }).skill_code;
  const theta = (getDb().prepare('SELECT theta FROM ability WHERE player_id = ? AND skill_code = ?').get(playerId, code) as { theta: number }).theta;
  return predict(theta);
}

beforeAll(() => {
  familyId = repo.createFamily('fox+hotdog', 'x:y', 'x:z', NOW);
});

describe('the new-player target eases 0.90 → 0.80 only as he steadies (§4, §6)', () => {
  it('starts ~0.90 and reaches 0.80 by SETTLE_SESSIONS for a steady winner', () => {
    expect(playerTarget(0, 0.06)).toBeCloseTo(NEW_PLAYER_TARGET, 5);
    expect(playerTarget(SETTLE_SESSIONS, 0.06)).toBeCloseTo(STEADY_TARGET, 5);
    const seq = [0, 1, 2, 3, 4].map((c) => playerTarget(c, 0.06));
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeLessThanOrEqual(seq[i - 1]); // monotonic down
  });
  it('a still-swinging child keeps the gentler target', () => {
    expect(playerTarget(SETTLE_SESSIONS, 0.2)).toBeGreaterThanOrEqual(0.88);
    expect(playerTarget(10, 0.2)).toBeGreaterThanOrEqual(0.88);
  });
});

describe('grade is a weak, date-corrected hint (§3, §6)', () => {
  it('a grade named in the summer seeds from grade-minus-one; in autumn as-is', () => {
    const july = Date.UTC(2026, 6, 15);
    const sept = Date.UTC(2026, 8, 15);
    expect(enteringGradeHint(3, july)).toBe(2);
    expect(enteringGradeHint(3, sept)).toBe(3);
    expect(enteringGradeHint(0, july)).toBe(0); // clamped at förskoleklass
  });
});

describe("a new player wins first, regardless of grade (§2, §7)", () => {
  it('the opener predicts ≥0.9 for every grade hint', () => {
    for (const g of [2, 3, 4, 5, 6]) {
      const p = repo.createPlayer(familyId, `g${g}`, g, NOW);
      const it = nextItem(p, g, NOW, { warmupTarget: RAMP_FLOOR_P, baseTarget: playerTarget(0, 0.06) });
      expect(pOfServed(it.itemId, p), `grade ${g} opener`).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('two consecutive misses trigger a retreat to easy ground (§5, §7)', () => {
    // a "behind" child: grade-4 hint, but he misses at the climbed level
    const p = repo.createPlayer(familyId, 'behind', 4, NOW);
    let now = NOW;
    for (let i = 0; i < 2; i++) {
      const it = nextItem(p, 4, now, { warmupTarget: rampTargetP(i + 3, 6, 0.9) }); // climbed, harder
      const wrong = __peekPendingAnswer(it.itemId) === '1' ? '2' : '1';
      answer(p, it.itemId, wrong, false, now);
      answer(p, it.itemId, wrong, false, now + 500); // wrong twice = a miss
      now += 60_000;
    }
    expect(repo.lastTwoMissed(p)).toBe(true);
    // the route responds by serving the easy floor again — assert that item is easy
    const retreat = nextItem(p, 4, now, { warmupTarget: RAMP_FLOOR_P });
    expect(pOfServed(retreat.itemId, p), 'retreat opener is easy').toBeGreaterThanOrEqual(0.9);
  });
});

describe('the child never declares a grade (§3, §7)', () => {
  it('the create-player UI does not post a grade', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/app/page.tsx'), 'utf8');
    // no create flow sends schoolYear to /api/player
    expect(/\/api\/player['"],\s*\{\s*icon,\s*schoolYear/.test(src)).toBe(false);
    expect(src.includes('schoolYear: year')).toBe(false);
    expect(src.includes('schoolYear: y }')).toBe(false);
  });
});
