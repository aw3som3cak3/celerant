import { describe, it, expect } from 'vitest';
import { buildItem } from '@/lib/item';
import { grade } from '@/lib/grade';
import { EN_SENTENCE_POOLS } from '@/lib/english-content';
import { SKILLS, skillByCode } from '@/skills';

// The English sentence-mode interference slice (docs/english-sentence-mode-spec.md). What these
// tests hold, beyond "it builds": the pedagogy's structural claims — ONE answer per item by
// construction, the L1 lure actually on screen (so a miss is the interference, not noise), a
// DISJOINT holdout for every RULE rung, and the reading gate.

const SEAMS = ['en_sv_order', 'en_do_question', 'en_do_negation', 'en_continuous'] as const;
const SEEDS = Array.from({ length: 80 }, (_, i) => (i + 1) * 7919); // spread, not 1..80 (adjacent seeds correlate)

describe('English sentence mode — the interference slice', () => {
  it('every rung builds a sentence prompt with exactly TWO word options', () => {
    for (const code of SEAMS) {
      for (const seed of SEEDS) {
        const item = buildItem(code, seed);
        const c = item.choice;
        expect(c, `${code}/${seed} has a choice spec`).toBeTruthy();
        expect(c!.prompt.show).toBe('sentence');
        expect(c!.options).toHaveLength(2);
        expect(c!.options.every((o) => o.render === 'word')).toBe(true);
        expect(c!.question.length).toBeGreaterThan(0);
        expect(item.prompt).toBe((c!.prompt as { text: string }).text); // the reveal/question log show what she saw
      }
    }
  });

  it('ONE answer per item: exactly one option grades correct, the other is the L1 lure', () => {
    for (const code of SEAMS) {
      const specs = EN_SENTENCE_POOLS[code].practice;
      for (const seed of SEEDS) {
        const item = buildItem(code, seed);
        const values = item.choice!.options.map((o) => String(o.value));
        expect(values.filter((v) => grade(v, item.answer))).toHaveLength(1); // exactly one correct
        expect(new Set(values).size).toBe(2); // and they are genuinely different
        // the OTHER option is the authored lure for this very item — the Swedish rule transferred
        const other = values.find((v) => !grade(v, item.answer))!;
        const match = specs.find((s) => s.text === item.prompt && s.answer === item.answer && s.lure === other);
        expect(match, `${code}/${seed}: "${other}" is the authored lure for "${item.prompt}"`).toBeTruthy();
      }
    }
  });

  it('the answer is a WORD answer (never parses as a number) so grading takes the case-insensitive path', () => {
    for (const code of SEAMS) {
      for (const seed of SEEDS.slice(0, 20)) {
        const item = buildItem(code, seed);
        expect(grade(item.answer.toUpperCase(), item.answer)).toBe(true); // case-insensitive
        expect(grade(`${item.answer} x`, item.answer)).toBe(false); // but exact
      }
    }
  });

  it('RULE rungs: practice and holdout are DISJOINT (a crossing is generalization, not a memorised list)', () => {
    for (const code of SEAMS) {
      const { practice, holdout } = EN_SENTENCE_POOLS[code];
      const key = (s: { text: string; answer: string }) => `${s.text}|${s.answer}`;
      const p = new Set(practice.map(key));
      const overlap = holdout.map(key).filter((k) => p.has(k));
      expect(overlap, `${code} holdout overlaps practice: ${overlap.join(', ')}`).toEqual([]);
      expect(holdout.length).toBeGreaterThan(0);
      // and the practice space is far wider than the 12-attempt accuracy window, so a crossing
      // cannot be item-memorisation
      expect(practice.length, `${code} practice pool`).toBeGreaterThanOrEqual(18);
      for (const s of [...practice, ...holdout]) expect(s.answer, `${code}: lure differs from answer`).not.toBe(s.lure);
    }
  });

  it('S1 word order: the lure is the SAME words in the Swedish V2 order', () => {
    const words = (s: string) => s.replace(/[.?]/g, '').toLowerCase().split(' ').sort().join(' ');
    for (const seed of SEEDS) {
      const item = buildItem('en_sv_order', seed);
      const [a, b] = item.choice!.options.map((o) => String(o.value));
      expect(words(a)).toBe(words(b)); // same words…
      expect(a).not.toBe(b); // …different order — the ONLY thing under discrimination
      const lure = grade(a, item.answer) ? b : a;
      // the lure inverts: its subject follows the verb, so it is not the answer
      expect(grade(lure, item.answer)).toBe(false);
    }
  });

  it('S2 do-support in questions: the answer carries DO, the lure is bare Swedish inversion', () => {
    for (const seed of SEEDS) {
      const item = buildItem('en_do_question', seed);
      expect(item.answer.startsWith('Do ')).toBe(true);
      expect(item.answer.endsWith('?')).toBe(true);
      const lure = item.choice!.options.map((o) => String(o.value)).find((v) => !grade(v, item.answer))!;
      expect(lure.toLowerCase().startsWith('do ')).toBe(false); // no do-support — the interference
    }
  });

  it("S3 do-support in negation: the answer carries don't, the lure puts *not* after the verb", () => {
    for (const seed of SEEDS) {
      const item = buildItem('en_do_negation', seed);
      expect(item.answer).toContain("don't");
      const lure = item.choice!.options.map((o) => String(o.value)).find((v) => !grade(v, item.answer))!;
      expect(lure).not.toContain("don't");
      expect(lure).toMatch(/ not[ .]/); // *inte* AFTER the verb, transferred ("I like not cats", "We understand not.")
    }
  });

  it('S4 aspect: the two options are the SAME verb in continuous vs simple, and both cues are taught', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const item = buildItem('en_continuous', seed);
      const values = item.choice!.options.map((o) => String(o.value));
      const cont = values.filter((v) => /^(is|am|are) \w+ing$/.test(v));
      const simple = values.filter((v) => !v.includes(' '));
      expect(cont, `${item.prompt} has one continuous form`).toHaveLength(1);
      expect(simple, `${item.prompt} has one simple form`).toHaveLength(1);
      expect(cont[0].split(' ')[1].startsWith(simple[0].replace(/s$/, ''))).toBe(true); // same verb
      expect(item.prompt).toContain('___'); // it is a cloze
      expect(item.steps[0]).toBe(item.prompt.replace('___', item.answer)); // the reveal completes the sentence
      seen.add(item.answer === cont[0] ? 'continuous' : 'simple');
    }
    expect([...seen].sort()).toEqual(['continuous', 'simple']); // the DISCRIMINATION, not one form
  });

  it('sits above the word tier, reading-gated, recognition-crossed, and chained one seam at a time', () => {
    expect(skillByCode('en_sv_order').requires).toContain('en_past_irregular'); // above English word production
    const chain = ['en_past_irregular', ...SEAMS];
    for (let i = 1; i < chain.length; i++) expect(skillByCode(chain[i]).requires).toContain(chain[i - 1]);
    for (const code of SEAMS) {
      const s = skillByCode(code);
      expect(s.crossRequires, `${code} needs READING`).toContain('spelling_t1c');
      expect(s.subject).toBe('english');
      expect(s.family).toBe('en_sentence');
      expect(s.format).toBe('choice'); // crosses on ACCURACY (recog_shadow), never a fluency target
      expect(s.sprintable).toBe(false);
      expect(s.kind).toBe('rule'); // RULE + disjoint holdout ⇒ generalization
      expect(s.year).toBeGreaterThanOrEqual(skillByCode('en_past_irregular').year);
    }
    // the family is this slice's alone (analysis aggregates by family)
    expect(SKILLS.filter((s) => s.family === 'en_sentence').map((s) => s.code).sort()).toEqual([...SEAMS].sort());
  });
});
