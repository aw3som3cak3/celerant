// Swedish spelling content (increment 4, first slice T2→T3). Real words only (A4),
// tagged rule (A3): PRACTICE builds accuracy, the fluency sprint draws from HOLDOUT so a
// crossing means generalization, not "memorised these 20". Words are namespaced under
// subject:'spelling' with namespaced families (increment-3 invariant).
//
// ⚠️ DRAFT — NATIVE REVIEW REQUIRED before this reaches a child. The subtle, lexicon-
// dependent check a machine can't fully make: a T2 word must have NO doubled-consonant
// minimal-pair cousin (vas/vass, sur/surr, lada/ladda, haka/hacka …) — those cousins ARE
// the T3 content and must not leak into the "transparent, unambiguous" T2 tier. The
// structural guards (no doubles, no sj/tj/ng/j digraphs, disjoint splits) are enforced by
// test/spelling-content.test.ts; the doubled-cousin exclusion needs Erik's ear.

export type WordPool = { practice: readonly string[]; holdout: readonly string[] };

// T2 — transparent encoding. Long-vowel / single-consonant words spelled as sounded.
// Excludes EVERY T3/T4 ambiguity by construction: no consonant doubling (T3), no sj/tj/j/
// ng (T4), no o-å or short e-ä vowel-quality traps (T4). The 2-syllable words (sida, resa,
// läsa …) deliberately SHOW the long-vowel/single-consonant shape that T3 will contrast.
export const T2_WORDS: WordPool = {
  practice: [
    'bil', 'gris', 'pris', 'ris', 'lim', 'tid', 'liv', 'hus', 'mus', 'ben',
    'ren', 'sten', 'rik', 'lin', 'is', 'lek', 'sida', 'resa', 'fara', 'gata',
    'läsa', 'näsa', 'äta', 'rita',
  ],
  holdout: ['ny', 'by', 'sy', 'yta', 'räv', 'träd', 'fira', 'rida', 'leva', 'myra', 'leka', 'lyra'],
};

// T3 — vowel length / consonant doubling. Minimal pairs whose ONLY audible difference is
// vowel length (short vowel ⇒ doubled consonant). PRACTICE and HOLDOUT use DIFFERENT pairs,
// so a sprint on the holdout pairs measures the rule, not memorised practice words.
// ⚠️ HELD: T3 requires recorded human audio (A12 — vowel length is exactly where TTS
// drifts). Not wired into the delivered graph until the manifest recordings are in hand.
export const T3_PAIRS: readonly { short: string; long: string }[] = [
  { short: 'vitt', long: 'vit' }, { short: 'matt', long: 'mat' }, { short: 'hall', long: 'hal' },
  { short: 'tack', long: 'tak' }, { short: 'full', long: 'ful' }, { short: 'sill', long: 'sil' },
  { short: 'lamm', long: 'lam' }, { short: 'kall', long: 'kal' }, { short: 'villa', long: 'vila' },
  { short: 'fett', long: 'fet' }, { short: 'hett', long: 'het' },
];
export const T3_WORDS: WordPool = {
  // 8 pairs for practice, 3 held back for the generalization sprint.
  practice: T3_PAIRS.slice(0, 8).flatMap((p) => [p.long, p.short]),
  holdout: T3_PAIRS.slice(8).flatMap((p) => [p.long, p.short]),
};

// Which pool backs each spelling skill code. A skill absent here is not a word-dictation
// skill. (T3 is authored but only enters this registry — and the graph — with its audio.)
export const SPELLING_POOLS: Record<string, WordPool> = {
  spelling_t2: T2_WORDS,
};

export type SpellingPhase = 'practice' | 'holdout';

// The word choice is carried in the (code, seed) the server already issues — so the pure
// client/grader path reproduces the exact word with NO new field and NO player state on the
// client. seed = index*2 + phase-bit: the SERVER-SIDE provider (nextSpellingWord) chooses
// the seed to select an unseen word; buildItem decodes it. Word choice is thus strictly
// downstream of skill selection — the selector never sees a word (A11).
export function encodeSpellingSeed(phase: SpellingPhase, index: number): number {
  return (index * 2 + (phase === 'holdout' ? 1 : 0)) >>> 0;
}
export function decodeSpellingSeed(seed: number): { phase: SpellingPhase; index: number } {
  return { phase: seed % 2 === 1 ? 'holdout' : 'practice', index: Math.floor(seed / 2) };
}

// The exact word a (code, seed) denotes — the one place seed→word lives, shared by buildItem
// (client render + server grade) and the provider's seen-set decode.
export function wordForSeed(code: string, seed: number): string | null {
  const pool = SPELLING_POOLS[code];
  if (!pool) return null;
  const { phase, index } = decodeSpellingSeed(seed);
  const words = pool[phase];
  return words.length ? words[index % words.length] : null;
}
