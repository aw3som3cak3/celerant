import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-qlog-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { sessionAnswer } from '@/lib/practice';
import { buildItem } from '@/lib/item';

const NOW = Date.UTC(2026, 7, 11);

describe('question_log: every wrong / idk answer records the rebuilt question', () => {
  let pid: string;
  beforeEach(() => {
    const fam = repo.createFamily(`q-${Math.random().toString(36).slice(2)}`, 'x:y', 'x:z', NOW);
    pid = repo.createPlayer(fam, 'mouse', 2, NOW);
  });

  // Each test uses its own timestamp and queries only rows since it (the DB is shared).
  it('a resolved WRONG answer logs the question with the correct answer', () => {
    const now = NOW + 1_000_000;
    const code = 'add_within_10';
    const seed = 4242;
    const sid = repo.createSessionRun(pid, 5, now, 'maths');
    // tries>1 so it's a RESOLVED wrong (first-try-wrong would just retry and record nothing)
    sessionAnswer({ id: pid, school_year: 2, stretch: 0 }, sid, code, seed, 'nonsense', false, 2, false, 3000, 'idem-w', now);
    const log = repo.getQuestionLog(now, 50);
    expect(log.length).toBe(1);
    expect(log[0].skill_code).toBe(code);
    expect(log[0].given).toBe('nonsense');
    expect(log[0].dont_know).toBe(0);
    expect(log[0].icon).toBe('mouse');
    // the correct answer was captured (rebuilt from the seed), not left opaque
    const it = buildItem(code, seed) as { answer: unknown };
    expect(log[0].answer).toBe(String(it.answer));
  });

  it('an "idk" logs the question with dont_know set and no given', () => {
    const now = NOW + 2_000_000;
    const sid = repo.createSessionRun(pid, 5, now, 'maths');
    sessionAnswer({ id: pid, school_year: 2, stretch: 0 }, sid, 'add_within_10', 77, null, true, 0, false, 3000, 'idem-i', now);
    const log = repo.getQuestionLog(now, 50);
    expect(log.length).toBe(1);
    expect(log[0].dont_know).toBe(1);
    expect(log[0].given).toBeNull();
    expect(log[0].answer).toBeTruthy();
  });

  it('a CORRECT answer logs nothing', () => {
    const now = NOW + 3_000_000;
    const code = 'add_within_10';
    const seed = 999;
    const it = buildItem(code, seed) as { answer: unknown };
    const sid = repo.createSessionRun(pid, 5, now, 'maths');
    sessionAnswer({ id: pid, school_year: 2, stretch: 0 }, sid, code, seed, String(it.answer), false, 1, false, 3000, 'idem-c', now);
    expect(repo.getQuestionLog(now, 50).length).toBe(0);
  });
});
