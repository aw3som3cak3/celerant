import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-english-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { issueNext, sessionSelectOpts } from '@/lib/practice';
import { subjectSeedGrade, seedGradeFor } from '@/lib/onboarding';
import { mixedSubjectsFor } from '@/lib/spelling-content';
import { EN_ED_REGULAR, EN_PAST_IRREGULAR, EN_KIND, EN_POOLS, englishReady, ENGLISH_MIN_YEAR } from '@/lib/english-content';
import { skillByCode } from '@/skills';
import { buildItem } from '@/lib/item';
import { grade } from '@/lib/grade';

const NOW = Date.UTC(2026, 7, 11);

describe('English — subject scoping + the beginner seed (A11 subjectSeedGrade)', () => {
  it('the seed grade is subject-aware: English is a beginner (0); maths/spelling unchanged (byte-identical)', () => {
    for (const y of [0, 1, 3, 4, 6]) {
      expect(subjectSeedGrade(y, 'maths')).toBe(seedGradeFor(y));
      expect(subjectSeedGrade(y, 'spelling')).toBe(seedGradeFor(y));
      expect(subjectSeedGrade(y, 'english')).toBe(0); // a Swedish åkN child is an English beginner
    }
  });

  it('mixedSubjectsFor builds the active SET; English only with headphones AND readiness', () => {
    expect(mixedSubjectsFor({ headphones: false, schoolYear: 4 })).toEqual(['maths']);
    expect(mixedSubjectsFor({ headphones: true, schoolYear: 0 })).toEqual(['maths', 'spelling']); // too young for English
    expect(mixedSubjectsFor({ headphones: true, schoolYear: ENGLISH_MIN_YEAR })).toEqual(['maths', 'spelling', 'english']);
    expect(mixedSubjectsFor({ explicit: 'english' })).toEqual(['english']);
    expect(englishReady(ENGLISH_MIN_YEAR - 1)).toBe(false);
  });

  it('a reader EARNS the English floor — en_ed_regular is served (not grade-skipped), the irregular waits behind it', () => {
    const fam = repo.createFamily(`en-${Math.random().toString(36).slice(2)}`, 'x:y', 'x:z', NOW);
    const pid = repo.createPlayer(fam, 'sushi', 4, NOW); // åk4 reader, fresh
    const sid = repo.createSessionRun(pid, 10, NOW, 'english');
    const opts = sessionSelectOpts({ id: pid, school_year: 4, stretch: 0 }, sid, NOW);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(issueNext(pid, 4, NOW, opts).code);
    expect([...seen]).toEqual(['en_ed_regular']); // the floor, earned — NOT skipped as "mastered"
    expect(seen.has('en_past_irregular')).toBe(false); // locked behind the -ed rule
  });
});

describe('English — the -ed / went split (rule vs lexical, A3)', () => {
  it('en_ed_regular is a RULE with a DISJOINT holdout (generalization is measurable)', () => {
    expect(EN_KIND['en_ed_regular']).toBe('rule');
    expect(skillByCode('en_ed_regular').kind).toBe('rule');
    const practice = new Set(EN_ED_REGULAR.practice);
    for (const w of EN_ED_REGULAR.holdout) expect(practice.has(w), `${w} leaks across the split`).toBe(false);
    expect(EN_ED_REGULAR.holdout.length).toBeGreaterThan(0);
  });

  it('en_past_irregular is LEXICAL: a closed set (holdout mirrors practice — repetition is correct)', () => {
    expect(EN_KIND['en_past_irregular']).toBe('lexical');
    expect(skillByCode('en_past_irregular').kind).toBe('lexical');
    expect(EN_PAST_IRREGULAR.holdout).toEqual(EN_PAST_IRREGULAR.practice);
    // the irregulars genuinely do NOT take -ed
    for (const w of EN_PAST_IRREGULAR.practice) expect(w.endsWith('ed')).toBe(false);
  });

  it('English skills are typed production on the letter pad (sprintable, never choice)', () => {
    for (const code of Object.keys(EN_POOLS)) {
      const s = skillByCode(code);
      expect(s.subject).toBe('english');
      expect(s.format).toBe('numpad');
    }
    expect(skillByCode('en_ed_regular').sprintable).toBe(true); // free-recall production is a fluency target
  });
});

describe('English — items build from the pool and grade as words', () => {
  it('buildItem(en_ed_regular, seed) yields a real past-tense word graded case-insensitively', () => {
    const it = buildItem('en_ed_regular', 2); // even seed → practice phase
    expect(it.prompt).toBe(''); // dictation: nothing shown
    expect(EN_ED_REGULAR.practice.includes(it.answer)).toBe(true);
    expect(grade(it.answer.toUpperCase(), it.answer)).toBe(true); // case-insensitive
    expect(grade('walkt', 'walked')).toBe(false); // the sv-interference miss is a real error
  });
});
