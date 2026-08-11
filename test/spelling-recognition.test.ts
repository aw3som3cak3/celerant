import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildItem, gradeBySeed } from '@/lib/item';
import { RECOG_WORDS, SPELLING_LETTERS, SPELLING_VOWELS, TRANSPARENT_WORDS, spellingAudio } from '@/lib/spelling-content';

const seeds = Array.from({ length: 60 }, (_, i) => (0x51e3 + i * 0x9e3779b1) >>> 0);

describe('recognition pool (T0/T1 shared words)', () => {
  it('every word has an isolated audio file and its initial letter is on the pad', () => {
    for (const w of RECOG_WORDS) {
      const file = path.join(process.cwd(), 'public', 'audio', 'spelling', 'recog', `${w.word}.mp3`);
      expect(existsSync(file), `missing audio: ${w.word}`).toBe(true);
      expect(SPELLING_LETTERS.includes(w.word[0]), `first letter off-pad: ${w.word}`).toBe(true);
      expect(w.word.startsWith(w.initial), `initial mismatch: ${w.word}/${w.initial}`).toBe(true);
    }
  });

  it('every TRANSPARENT_WORDS word has an isolated /recog/ clip (T1/T0b/T1b/T1c audio)', () => {
    const missing = TRANSPARENT_WORDS.filter(
      (w) => !existsSync(path.join(process.cwd(), 'public', 'audio', 'spelling', 'recog', `${w.word}.mp3`)),
    );
    expect(missing.map((w) => w.word), 'missing /recog/ audio').toEqual([]);
  });

  it('spellingAudio routes a recognition code to the /recog/ isolated clip', () => {
    const a = spellingAudio('spelling_t1', 'sol');
    expect(a).toEqual({ kind: 'file', url: '/audio/spelling/recog/sol.mp3' });
  });
});

describe('spelling_t1 — hear a word, tap its first letter', () => {
  it('builds a listen-prompt choice with letter options, one of which is correct', () => {
    for (const seed of seeds) {
      const item = buildItem('spelling_t1', seed);
      const c = item.choice;
      expect(c, 'no choice on spelling_t1 item').toBeTruthy();
      expect(c!.prompt.show).toBe('listen');
      // the target word is a real recognition word and the answer is its first letter
      const word = c!.prompt.show === 'listen' ? c!.prompt.word : '';
      expect(TRANSPARENT_WORDS.some((w) => w.word === word)).toBe(true);
      expect(item.answer).toBe(word[0]);
      // three distinct letter options, all on the pad, exactly one equal to the answer
      expect(c!.options.length).toBe(3);
      expect(c!.options.every((o) => o.render === 'letter')).toBe(true);
      const values = c!.options.map((o) => String(o.value));
      expect(new Set(values).size).toBe(3);
      expect(values.filter((v) => v === word[0]).length).toBe(1);
      expect(values.every((v) => SPELLING_LETTERS.includes(v))).toBe(true);
    }
  });

  it('grades the correct letter right and a wrong letter wrong', () => {
    const seed = seeds[0];
    const word = (() => { const c = buildItem('spelling_t1', seed).choice!; return c.prompt.show === 'listen' ? c.prompt.word : ''; })();
    expect(gradeBySeed('spelling_t1', seed, word[0]).correct).toBe(true);
    const wrong = SPELLING_LETTERS.find((l) => l !== word[0])!;
    expect(gradeBySeed('spelling_t1', seed, wrong).correct).toBe(false);
  });
});

const listenWord = (code: string, seed: number): string => {
  const c = buildItem(code, seed).choice!;
  return c.prompt.show === 'listen' ? c.prompt.word : '';
};

describe('spelling_t0 — initial-sound match by picture', () => {
  it('plays a target and offers 3 pictures, one of which starts with the same sound', () => {
    for (const seed of seeds) {
      const c = buildItem('spelling_t0', seed).choice!;
      expect(c.prompt.show).toBe('listen');
      const target = listenWord('spelling_t0', seed);
      const targetInitial = RECOG_WORDS.find((w) => w.word === target)!.initial;
      expect(c.options.length).toBe(3);
      expect(c.options.every((o) => o.render === 'picture')).toBe(true);
      const answer = String(buildItem('spelling_t0', seed).answer);
      const answerWord = RECOG_WORDS.find((w) => w.word === answer)!;
      expect(answerWord.initial).toBe(targetInitial); // same initial sound
      expect(answerWord.word).not.toBe(target); // a DIFFERENT word (not the target itself)
      // exactly one option shares the target's initial (the answer); the two distractors differ
      const sameInitial = c.options.filter((o) => RECOG_WORDS.find((w) => w.word === String(o.value))!.initial === targetInitial);
      expect(sameInitial.length).toBe(1);
      expect(gradeBySeed('spelling_t0', seed, answer).correct).toBe(true);
    }
  });
});

describe('spelling_t0b — segment: how many sounds', () => {
  it('answer equals the transparent word’s sound count; 3 distinct numeral options', () => {
    for (const seed of seeds) {
      const word = listenWord('spelling_t0b', seed);
      const tw = TRANSPARENT_WORDS.find((w) => w.word === word)!;
      const c = buildItem('spelling_t0b', seed).choice!;
      expect(c.options.every((o) => o.render === 'numeral')).toBe(true);
      expect(new Set(c.options.map((o) => o.value)).size).toBe(3);
      expect(gradeBySeed('spelling_t0b', seed, String(tw.sounds)).correct).toBe(true);
    }
  });
});

describe('spelling_t1b / spelling_t1c — final letter and the vowel', () => {
  it('t1b answer is the last letter of a transparent word', () => {
    for (const seed of seeds) {
      const word = listenWord('spelling_t1b', seed);
      expect(TRANSPARENT_WORDS.some((w) => w.word === word)).toBe(true);
      expect(buildItem('spelling_t1b', seed).answer).toBe(word[word.length - 1]);
    }
  });
  it('t1c answer is the vowel, options are all vowels', () => {
    for (const seed of seeds) {
      const word = listenWord('spelling_t1c', seed);
      const tw = TRANSPARENT_WORDS.find((w) => w.word === word)!;
      const c = buildItem('spelling_t1c', seed).choice!;
      expect(buildItem('spelling_t1c', seed).answer).toBe(tw.vowel);
      expect(c.options.every((o) => SPELLING_VOWELS.includes(String(o.value)))).toBe(true);
      expect(gradeBySeed('spelling_t1c', seed, tw.vowel).correct).toBe(true);
    }
  });
});
