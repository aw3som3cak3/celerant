import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { T2_WORDS } from '@/lib/spelling-content';

// The carrier sentences that back the FIRST 34 T2 words (scripts/spelling-audio/sentences.json).
// The expanded bank uses isolated clips, so the hard guarantee is AUDIO coverage (every T2 word
// has a clip); the sentence checks only govern the words that have a sentence.
const sentences: Record<string, string> = JSON.parse(
  readFileSync(path.join(process.cwd(), 'scripts', 'spelling-audio', 'sentences.json'), 'utf8'),
);

const t2 = [...T2_WORDS.practice, ...T2_WORDS.holdout];

describe('T2 audio + carrier-sentence coverage', () => {
  it('every T2 word has an audio clip', () => {
    const missing = t2.filter((w) => !existsSync(path.join(process.cwd(), 'public', 'audio', 'spelling', 't2', `${w}.mp3`)));
    expect(missing, `no audio for: ${missing}`).toEqual([]);
  });

  it('every carrier sentence contains its word (as a whole word)', () => {
    // Swedish-letter-aware boundary: JS \b in ASCII mode treats å/ä/ö as non-word chars, so
    // \bäta\b would wrongly fail. Bound on "not a Latin letter" (À-ÿ covers åäöÅÄÖ) instead.
    const bad = Object.keys(sentences).filter((w) => !new RegExp(`(^|[^A-Za-zÀ-ÿ])${w}([^A-Za-zÀ-ÿ]|$)`, 'iu').test(sentences[w]));
    expect(bad, `sentence does not contain the word: ${bad}`).toEqual([]);
  });

  it('has no orphan sentences (every key is a current T2 word)', () => {
    const orphans = Object.keys(sentences).filter((w) => !t2.includes(w));
    expect(orphans, `orphan sentence keys: ${orphans}`).toEqual([]);
  });
});
