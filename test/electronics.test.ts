import { describe, it, expect } from 'vitest';
import { SKILLS, BY_CODE, ancestors, generateCanon, skillByCode } from '@/skills';
import { makeRng } from '@/lib/rng';
import { grade } from '@/lib/grade';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Electronics slice 1 ("Tänd en lysdiod"), the app's fourth subject. These lock the FIXED CONTRACT
// (the 8 skill codes, another agent references them), the graph shape, and the cross-subject/model
// gates — while proving the engine stayed subject-blind (no electronics logic outside skills.ts).

const MODEL = ['elec_loop', 'elec_not_consumed', 'elec_polarity'];
const RECOG = ['elec_id_parts', 'elec_symbol_match'];
const CALC = ['elec_resistor_pick', 'elec_colour_value', 'elec_series_add'];
const ALL = [...MODEL, ...RECOG, ...CALC];

describe('electronics — the 8 in-app skills (fixed contract)', () => {
  it('all eight codes exist and carry subject: electronics', () => {
    for (const code of ALL) {
      const s = BY_CODE.get(code);
      expect(s, `missing skill ${code}`).toBeTruthy();
      expect(s!.subject, code).toBe('electronics');
    }
  });

  it('no OTHER subject leaked into an elec_ family (subject-blind engine, namespaced families)', () => {
    for (const s of SKILLS) {
      if (s.family.startsWith('elec_')) expect(s.subject, s.code).toBe('electronics');
      if (s.subject === 'electronics') expect(s.family.startsWith('elec_'), s.code).toBe(true);
    }
  });
});

describe('electronics — accuracy vs fluency split', () => {
  it('MODEL skills are accuracy-graded (choice ⇒ never sprinted)', () => {
    for (const code of MODEL) {
      const s = skillByCode(code);
      expect(s.format, code).toBe('choice');
      expect(s.sprintable, code).toBe(false);
    }
  });

  it('RECOGNITION skills are choice (recognition-crossing, no stopwatch on a tap)', () => {
    for (const code of RECOG) {
      expect(skillByCode(code).format, code).toBe('choice');
      expect(skillByCode(code).sprintable, code).toBe(false);
    }
  });

  it('CALCULATION skills are numpad and fluency-sprintable', () => {
    for (const code of CALC) {
      const s = skillByCode(code);
      expect(s.format, code).toBe('numpad');
      expect(s.sprintable, code).toBe(true);
    }
  });
});

describe('electronics — cross-subject maths gates (crossRequires)', () => {
  it('elec_resistor_pick consumes division + subtraction', () => {
    const cr = skillByCode('elec_resistor_pick').crossRequires ?? [];
    expect(cr).toContain('div_mixed');
    expect(cr).toContain('sub_within_10');
  });
  it('elec_colour_value consumes place-value / powers of ten', () => {
    expect(skillByCode('elec_colour_value').crossRequires ?? []).toContain('mult_by_powers_of_ten');
  });
  it('elec_series_add consumes addition', () => {
    expect(skillByCode('elec_series_add').crossRequires ?? []).toContain('add_2d_carry');
  });
  it('every electronics rung is reading-gated (Swedish instructions, §3)', () => {
    for (const code of ALL) expect(skillByCode(code).crossRequires ?? [], code).toContain('spelling_t1c');
  });
  it('the gated maths codes all exist in the maths graph', () => {
    for (const c of ['div_mixed', 'sub_within_10', 'mult_by_powers_of_ten', 'add_2d_carry']) {
      expect(BY_CODE.get(c)?.subject, c).toBe('maths');
    }
  });
});

describe('electronics — the model tier gates every calculation skill (§1a)', () => {
  it('no calc skill is reachable until all three model skills are met', () => {
    for (const code of CALC) {
      const anc = ancestors(code);
      for (const m of MODEL) expect(anc.has(m), `${code} must depend on ${m}`).toBe(true);
    }
  });
  it('symbol_match (recognition) also sits above the whole model tier', () => {
    const anc = ancestors('elec_symbol_match');
    for (const m of MODEL) expect(anc.has(m), m).toBe(true);
  });
  it('the model tier itself needs no other subject-content but reading', () => {
    // elec_loop is the subject root: no intra-subject prerequisite.
    expect(skillByCode('elec_loop').requires).toEqual([]);
  });
});

describe('electronics — model distractors ARE the documented misconceptions', () => {
  const optArts = (code: string): string[] => {
    // sample many items and collect every option art shown, so a randomised distractor is not missed.
    const arts = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const it = generateCanon(code, makeRng((i * 2654435761) >>> 0));
      for (const o of it.choice!.options) if ('art' in o) arts.add((o as { art: string }).art);
    }
    return [...arts];
  };

  it('elec_loop offers the one-wire (unipolar) and clashing-currents wrong models', () => {
    const arts = optArts('elec_loop');
    expect(arts).toContain('loop_ok'); // the correct model
    expect(arts).toContain('loop_unipolar'); // unipolar / one-wire misconception
    expect(arts).toContain('loop_clash'); // clashing-currents misconception
  });

  it('elec_not_consumed offers the "used up" (cookie-monster) wrong model', () => {
    const arts = optArts('elec_not_consumed');
    expect(arts).toContain('flow_ok');
    expect(arts).toContain('flow_used_up'); // consumption / cookie-monster
  });

  it('the correct answer always grades and is one of the shown options', () => {
    for (const code of [...MODEL, ...RECOG]) {
      for (let i = 0; i < 20; i++) {
        const it = generateCanon(code, makeRng((i * 40503 + 7) >>> 0));
        const values = it.choice!.options.map((o) => String(o.value));
        expect(values, code).toContain(it.answer);
        expect(grade(it.answer, it.answer), code).toBe(true);
      }
    }
  });
});

describe('electronics — calculation content is clean whole-number arithmetic', () => {
  it('elec_resistor_pick answers R = (Vs − Vled)/I with a whole resistor, subtraction within 10', () => {
    for (let i = 0; i < 200; i++) {
      const it = generateCanon('elec_resistor_pick', makeRng((i * 2246822519) >>> 0));
      const m = it.prompt.match(/\((\d+) − (\d+)\) \/ (\d+)/)!;
      const vs = +m[1], vled = +m[2], iCur = +m[3];
      expect(vs - vled).toBeGreaterThanOrEqual(0);
      expect(vs).toBeLessThanOrEqual(10); // subtraction stays within sub_within_10
      expect((vs - vled) % iCur).toBe(0); // exact division
      expect(it.answer).toBe(String((vs - vled) / iCur));
    }
  });

  it('elec_series_add totals two resistors', () => {
    for (let i = 0; i < 50; i++) {
      const it = generateCanon('elec_series_add', makeRng((i * 22695477 + 1) >>> 0));
      const m = it.prompt.match(/(\d+) Ω \+ (\d+) Ω/)!;
      expect(it.answer).toBe(String(+m[1] + +m[2]));
    }
  });

  it('elec_colour_value reads colour bands as (d1·10 + d2) × 10^m', () => {
    const map: Record<string, number> = { svart: 0, brun: 1, röd: 2, orange: 3, gul: 4, grön: 5, blå: 6, violett: 7, grå: 8, vit: 9 };
    for (let i = 0; i < 80; i++) {
      const it = generateCanon('elec_colour_value', makeRng((i * 3266489917 + 3) >>> 0));
      const [c1, c2, cm] = it.prompt.replace(' =', '').split(' ');
      const value = (map[c1] * 10 + map[c2]) * 10 ** map[cm];
      expect(it.answer).toBe(String(value));
    }
  });
});

describe('electronics — assets referenced by the generators exist', () => {
  it('every art name a generator emits has a matching /public/elec/<art>.svg', () => {
    const root = path.join(process.cwd(), 'public', 'elec');
    for (const code of [...MODEL, ...RECOG]) {
      for (let i = 0; i < 30; i++) {
        const it = generateCanon(code, makeRng((i * 6364136223 + 11) >>> 0));
        if (it.choice!.prompt.show === 'elec' && it.choice!.prompt.art) {
          expect(existsSync(path.join(root, `${it.choice!.prompt.art}.svg`)), it.choice!.prompt.art).toBe(true);
        }
        for (const o of it.choice!.options) {
          if ('art' in o) expect(existsSync(path.join(root, `${(o as { art: string }).art}.svg`)), (o as { art: string }).art).toBe(true);
        }
      }
    }
  });
});
