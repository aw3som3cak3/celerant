import { describe, it, expect } from 'vitest';
import { buildItem } from '@/lib/item';
import { grade } from '@/lib/grade';
import { EN_SENTENCE_POOLS } from '@/lib/english-content';
import { SKILLS, skillByCode } from '@/skills';

// The English sentence-mode interference slice (docs/english-sentence-mode-spec.md). What these
// tests hold, beyond "it builds": the pedagogy's structural claims — ONE answer per item by
// construction, the L1 lure actually on screen (so a miss is the interference, not noise), a
// DISJOINT holdout for every RULE rung, and the reading gate.

// The syntactic seams (S1-S4, RULE) and the collocation/lexical seams (S5-S8) — every rung in the
// slice, in graph order.
const SYNTACTIC = ['en_sv_order', 'en_do_question', 'en_do_negation', 'en_continuous'] as const;
const LEXICAL = ['en_preposition', 'en_is_get', 'en_make_do', 'en_false_friend'] as const;
const SEAMS = [...SYNTACTIC, ...LEXICAL] as const;
const RULE_SEAMS = [...SYNTACTIC, 'en_preposition'] as const; // disjoint-holdout generalization nodes
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

  it('every seam has a DISJOINT holdout; RULE seams also have a pool wider than the crossing window', () => {
    for (const code of SEAMS) {
      const { practice, holdout } = EN_SENTENCE_POOLS[code];
      const key = (s: { text: string; answer: string }) => `${s.text}|${s.answer}`;
      const p = new Set(practice.map(key));
      const overlap = holdout.map(key).filter((k) => p.has(k));
      expect(overlap, `${code} holdout overlaps practice: ${overlap.join(', ')}`).toEqual([]);
      expect(holdout.length, `${code} has a holdout`).toBeGreaterThan(0);
      for (const s of [...practice, ...holdout]) expect(s.answer, `${code}: lure differs from answer`).not.toBe(s.lure);
      // A RULE crossing must mean generalization, so its practice space is far wider than the
      // 12-attempt accuracy window — it cannot be item-memorisation. A LEXICAL rung is a CLOSED
      // contrast: repetition over a small set is the point, so no width floor applies.
      if ((RULE_SEAMS as readonly string[]).includes(code)) expect(practice.length, `${code} practice pool`).toBeGreaterThanOrEqual(18);
    }
  });

  it('the lexical seams are English CLOZE items whose two options are the contrast pair', () => {
    for (const code of LEXICAL) {
      for (const seed of SEEDS) {
        const item = buildItem(code, seed);
        expect((item.choice!.prompt as { lang: string }).lang).toBe('en');
        expect(item.prompt).toContain('___');
        expect(item.prompt.match(/___/g)).toHaveLength(1); // ONE gap ⇒ one answer
        expect(item.steps[0]).toBe(item.prompt.replace('___', item.answer)); // reveal completes the sentence
        expect(item.answer).not.toContain('___');
      }
    }
  });

  it('S5 prepositions: the lure is the preposition the Swedish phrase would hand you', () => {
    const classes = new Map<string, Set<string>>(); // answer → the lures seen for it
    for (const s of EN_SENTENCE_POOLS.en_preposition.practice) {
      expect(s.answer.split(' ')).toHaveLength(1); // a single preposition fills the gap
      if (!classes.has(s.answer)) classes.set(s.answer, new Set());
      classes.get(s.answer)!.add(s.lure);
    }
    expect(classes.size).toBeGreaterThanOrEqual(4); // several English prepositions, not one
    // "on" is the dominant mis-transfer (*på*), so it must be the lure across several collocations
    const onLures = EN_SENTENCE_POOLS.en_preposition.practice.filter((s) => s.lure === 'on');
    expect(onLures.length).toBeGreaterThanOrEqual(9);
    expect(new Set(onLures.map((s) => s.answer)).size).toBeGreaterThanOrEqual(3); // på maps to at/to/for/about/in
  });

  it('S6 is/get/become teaches the SPLIT — become is sometimes the right answer, not always the lure', () => {
    const pool = EN_SENTENCE_POOLS.en_is_get;
    const answers = new Set([...pool.practice, ...pool.holdout].map((s) => s.answer.replace(/s$/, '')));
    expect([...answers].sort()).toEqual(['become', 'get', 'turn']); // all three, not just get
    expect(pool.practice.some((s) => s.answer.startsWith('become'))).toBe(true);
    expect(pool.practice.some((s) => s.lure.startsWith('become'))).toBe(true);
  });

  it('S7 make/do: every item contrasts exactly those two verbs', () => {
    for (const s of [...EN_SENTENCE_POOLS.en_make_do.practice, ...EN_SENTENCE_POOLS.en_make_do.holdout]) {
      expect(['make', 'do', 'made', 'did'], `${s.text}`).toContain(s.answer.toLowerCase());
      expect(['make', 'do', 'made', 'did'], `${s.text}`).toContain(s.lure.toLowerCase());
      expect(s.answer.toLowerCase().startsWith('m')).not.toBe(s.lure.toLowerCase().startsWith('m')); // one of each
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

  it('hangs off the PRINT BRIDGE (never a production rung), reading-gated, chained one seam at a time', () => {
    // The door must obey the tier's own rule. en_word_picture is the top of the print bridge —
    // accuracy-crossed and reading-gated — so the whole path in is fluency-free and the READING gate
    // is the real barrier. Anchoring on a production rung (it once required en_past_irregular) would
    // dam a diagnostic recognition tier behind an irregular-past sprint it has no dependency on.
    expect(skillByCode('en_sv_order').requires).toEqual(['en_word_picture']);
    const door = skillByCode('en_word_picture');
    expect(door.format, 'the door is accuracy-crossed, not a fluency target').toBe('choice');
    expect(door.sprintable).toBe(false);
    expect(door.crossRequires).toContain('spelling_t1c');
    // no rung in this slice may depend on an English PRODUCTION rung, directly or as its door
    const production = new Set(SKILLS.filter((s) => s.subject === 'english' && s.format !== 'choice').map((s) => s.code));
    for (const code of SEAMS) {
      for (const r of skillByCode(code).requires) expect(production.has(r), `${code} requires production rung ${r}`).toBe(false);
    }
    const chain = ['en_word_picture', ...SEAMS];
    for (let i = 1; i < chain.length; i++) expect(skillByCode(chain[i]).requires).toContain(chain[i - 1]);
    for (const code of SEAMS) {
      const s = skillByCode(code);
      expect(s.crossRequires, `${code} needs READING`).toContain('spelling_t1c');
      expect(s.subject).toBe('english');
      expect(s.family).toBe('en_sentence');
      expect(s.format).toBe('choice'); // crosses on ACCURACY (recog_shadow), never a fluency target
      expect(s.sprintable).toBe(false);
      // RULE (+ disjoint holdout ⇒ generalization) for the syntactic seams and prepositions;
      // LEXICAL (a closed contrast) for bli / göra / the false friends.
      expect(s.kind, code).toBe((RULE_SEAMS as readonly string[]).includes(code) ? 'rule' : 'lexical');
      expect(s.year).toBeGreaterThanOrEqual(skillByCode('en_past_irregular').year);
    }
    // the family is this slice's alone (analysis aggregates by family)
    expect(SKILLS.filter((s) => s.family === 'en_sentence').map((s) => s.code).sort()).toEqual([...SEAMS].sort());
  });
});
