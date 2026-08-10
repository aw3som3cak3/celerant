import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { T2_WORDS } from '@/lib/spelling-content';

// The carrier sentences that back the T2 audio (scripts/spelling-audio/sentences.json). This
// guards the audio pipeline: every T2 word must have a sentence, and the sentence must actually
// contain the word (else the "Ordet. Mening. Ordet." frame would speak a word the child isn't
// being asked to spell). Catches drift when a T2 word is added/renamed without new audio.
const sentences: Record<string, string> = JSON.parse(
  readFileSync(path.join(process.cwd(), 'scripts', 'spelling-audio', 'sentences.json'), 'utf8'),
);

const t2 = [...T2_WORDS.practice, ...T2_WORDS.holdout];

describe('T2 carrier-sentence coverage', () => {
  it('every T2 word has a carrier sentence', () => {
    const missing = t2.filter((w) => !sentences[w]);
    expect(missing, `no sentence for: ${missing}`).toEqual([]);
  });

  it('every carrier sentence contains its word (as a whole word)', () => {
    // Swedish-letter-aware boundary: JS \b in ASCII mode treats å/ä/ö as non-word chars, so
    // \bäta\b would wrongly fail. Bound on "not a Latin letter" (À-ÿ covers åäöÅÄÖ) instead.
    const bad = t2.filter((w) => !new RegExp(`(^|[^A-Za-zÀ-ÿ])${w}([^A-Za-zÀ-ÿ]|$)`, 'iu').test(sentences[w] ?? ''));
    expect(bad, `sentence does not contain the word: ${bad}`).toEqual([]);
  });

  it('has no orphan sentences (every key is a current T2 word)', () => {
    const orphans = Object.keys(sentences).filter((w) => !t2.includes(w));
    expect(orphans, `orphan sentence keys: ${orphans}`).toEqual([]);
  });
});
