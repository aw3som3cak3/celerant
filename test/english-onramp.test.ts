import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildItem } from '@/lib/item';
import { EN_NOUNS, EN_NOUN_WORDS, EN_COLOR_WORDS, EN_VERBS, EN_VERB_WORDS, EN_VERB_ING_WORDS, EN_ATTRS, EN_ATTR_WORDS, EN_TWOWORD_PHRASES, EN_FRAME_PHRASES, enNounItem, englishReady } from '@/lib/english-content';
import { SKILLS } from '@/skills';

const RECOG = ['en_noun_cognate', 'en_noun_core', 'en_noun_category', 'en_noun_minpair'];
const rng = (seed: number) => {
  let s = seed >>> 0;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return { int: (a: number, b: number) => a + Math.floor(next() * (b - a + 1)), pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] };
};

describe('English on-ramp — Phase A (receptive: hear → tap picture)', () => {
  it('every recognition rung builds a listen prompt + 3 picture options with a valid answer', () => {
    for (const code of RECOG) {
      for (let seed = 1; seed <= 40; seed++) {
        const item = buildItem(code, seed);
        expect(item.choice, `${code} seed ${seed} has a choice`).toBeTruthy();
        const c = item.choice!;
        expect(c.prompt).toMatchObject({ show: 'listen', code }); // audio prompt, routed to englishAudio via en_ prefix
        expect(c.options).toHaveLength(3);
        expect(c.options.every((o) => o.render === 'picture' && typeof o.kind === 'string')).toBe(true);
        const values = c.options.map((o) => String(o.value));
        expect(new Set(values).size, 'options are distinct').toBe(3);
        expect(values).toContain(String(item.answer)); // the answer word is one of the pictures
      }
    }
  });

  it('every noun has its picture PNG and its en-GB audio clip', () => {
    for (const n of EN_NOUNS) {
      expect(existsSync(path.join(process.cwd(), 'public', 'emoji', `${n.emoji}.png`)), `emoji ${n.emoji}.png`).toBe(true);
    }
    for (const w of EN_NOUN_WORDS) {
      expect(existsSync(path.join(process.cwd(), 'public', 'audio', 'english', `${w}.mp3`)), `audio ${w}.mp3`).toBe(true);
    }
  });

  it('discrimination modes shape the distractors', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const cog = enNounItem(rng(seed), 'cognate');
      expect(cog.target.cognate).toBe(true);
      const cat = enNounItem(rng(seed + 500), 'category');
      // at least one distractor shares the target's category (same-category discrimination)
      expect(cat.options.filter((o) => o.category === cat.target.category).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('Phase B: en_color builds a listen prompt + 3 swatch options, and every colour has audio', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const c = buildItem('en_color', seed).choice!;
      expect(c.prompt).toMatchObject({ show: 'listen', code: 'en_color' });
      expect(c.options).toHaveLength(3);
      expect(c.options.every((o) => o.render === 'swatch' && typeof (o as { color?: string }).color === 'string')).toBe(true);
      const values = c.options.map((o) => String(o.value));
      expect(values).toContain(String(buildItem('en_color', seed).answer));
    }
    for (const w of EN_COLOR_WORDS) {
      expect(existsSync(path.join(process.cwd(), 'public', 'audio', 'english', `${w}.mp3`)), `colour audio ${w}.mp3`).toBe(true);
    }
  });

  it('Phase C: en_verb_action builds a listen prompt + 3 picto options, each with an SVG and audio', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const c = buildItem('en_verb_action', seed).choice!;
      expect(c.prompt).toMatchObject({ show: 'listen', code: 'en_verb_action' });
      expect(c.options).toHaveLength(3);
      expect(c.options.every((o) => o.render === 'picto' && typeof (o as { kind?: string }).kind === 'string')).toBe(true);
      expect(c.options.map((o) => String(o.value))).toContain(String(buildItem('en_verb_action', seed).answer));
    }
    for (const v of EN_VERBS) {
      expect(existsSync(path.join(process.cwd(), 'public', 'pictos', `${v.picto}.svg`)), `picto ${v.picto}.svg`).toBe(true);
    }
    for (const w of EN_VERB_WORDS) {
      expect(existsSync(path.join(process.cwd(), 'public', 'audio', 'english', `${w}.mp3`)), `verb audio ${w}.mp3`).toBe(true);
    }
  });

  it('Phase C: en_verb_ing reuses the verb pictos, grades the -ing form, and every -ing has audio', () => {
    const ings = new Set<string>(EN_VERB_ING_WORDS);
    for (let seed = 1; seed <= 30; seed++) {
      const item = buildItem('en_verb_ing', seed);
      const c = item.choice!;
      expect(c.prompt).toMatchObject({ show: 'listen', code: 'en_verb_ing' });
      expect(c.options.every((o) => o.render === 'picto')).toBe(true); // reuses the verb pictos
      expect(c.options.every((o) => ings.has(String(o.value)))).toBe(true); // graded on the -ing form
      expect(String(item.answer).endsWith('ing')).toBe(true);
    }
    for (const w of EN_VERB_ING_WORDS) {
      expect(existsSync(path.join(process.cwd(), 'public', 'audio', 'english', `${w}.mp3`)), `-ing audio ${w}.mp3`).toBe(true);
    }
  });

  it('Phase B: en_attribute always shows the contrastive PARTNER, and every attribute has picto + audio', () => {
    const byWord = new Map(EN_ATTRS.map((a) => [a.word, a]));
    for (let seed = 1; seed <= 40; seed++) {
      const item = buildItem('en_attribute', seed);
      const c = item.choice!;
      expect(c.prompt).toMatchObject({ show: 'listen', code: 'en_attribute' });
      expect(c.options).toHaveLength(3);
      expect(c.options.every((o) => o.render === 'picto')).toBe(true);
      const target = byWord.get(String(item.answer))!;
      const partner = EN_ATTRS.find((a) => a.pair === target.pair && a.word !== target.word)!;
      expect(c.options.map((o) => String(o.value))).toContain(partner.word); // the contrast is always on screen
    }
    for (const a of EN_ATTRS) expect(existsSync(path.join(process.cwd(), 'public', 'pictos', `${a.picto}.svg`)), `picto ${a.picto}.svg`).toBe(true);
    for (const w of EN_ATTR_WORDS) expect(existsSync(path.join(process.cwd(), 'public', 'audio', 'english', `${w}.mp3`)), `attr audio ${w}.mp3`).toBe(true);
  });

  it('Phase B: en_two_word recombines size+noun (same noun other size always shown), with phrase audio', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const item = buildItem('en_two_word', seed);
      const c = item.choice!;
      expect(c.prompt).toMatchObject({ show: 'listen', code: 'en_two_word' });
      expect(c.options).toHaveLength(3);
      expect(c.options.every((o) => o.render === 'sizednoun')).toBe(true);
      const ans = String(item.answer); // e.g. "big cat"
      expect(c.options.map((o) => String(o.value))).toContain(ans);
      const [size, noun] = ans.split(' ');
      const otherSize = size === 'big' ? 'small' : 'big';
      expect(c.options.map((o) => String(o.value))).toContain(`${otherSize} ${noun}`); // the size contrast is present
    }
    for (const p of EN_TWOWORD_PHRASES) expect(existsSync(path.join(process.cwd(), 'public', 'audio', 'english', `${p}.mp3`)), `phrase ${p}`).toBe(true);
  });

  it('Phase C: en_frame_svo binds agent+action (distractors flip each), with sentence audio', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const item = buildItem('en_frame_svo', seed);
      const c = item.choice!;
      expect(c.prompt).toMatchObject({ show: 'listen', code: 'en_frame_svo' });
      expect(c.options).toHaveLength(3);
      expect(c.options.every((o) => o.render === 'nounverb' && typeof (o as { noun?: string }).noun === 'string')).toBe(true);
      expect(String(item.answer)).toMatch(/^the \w+ is \w+ing$/);
      expect(c.options.map((o) => String(o.value))).toContain(String(item.answer));
    }
    for (const p of EN_FRAME_PHRASES) expect(existsSync(path.join(process.cwd(), 'public', 'audio', 'english', `${p}.mp3`)), `frame ${p}`).toBe(true);
  });

  it('is offered to every child (receptive tier ungated), incl. the youngest', () => {
    expect(englishReady(0)).toBe(true);
    expect(englishReady(4)).toBe(true);
  });

  it('the -ed production rung is re-parented onto the ramp (behind en_noun_minpair)', () => {
    const ed = SKILLS.find((s) => s.code === 'en_ed_regular')!;
    expect(ed.requires).toContain('en_noun_minpair');
    // the receptive rungs are choice-format and chained
    expect(SKILLS.find((s) => s.code === 'en_noun_cognate')!.format).toBe('choice');
    expect(SKILLS.find((s) => s.code === 'en_noun_minpair')!.requires).toContain('en_noun_category');
  });
});
