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

// Reading readiness. T2 is WORD dictation — the child must know letters and be able to write,
// which a pre-literate åk0 child cannot. The "koala reflex": the youngest has zero letter data,
// so spelling is built for the writers (åk≥1) and she gets maths only until the T0/T1 sound/
// letter rungs exist as the true lowest ring. Raise or lower this one number to retune.
export const SPELLING_MIN_YEAR = 1;
export function spellingReady(schoolYear: number): boolean {
  return schoolYear >= SPELLING_MIN_YEAR;
}

// The active subject SET for a session. An explicit subject (map deep-link) stays single. A
// mixed Öva interleaves spelling only when the child both has headphones AND is reading-ready.
export function mixedSubjectsFor(opts: {
  explicit?: 'maths' | 'spelling';
  headphones?: boolean;
  schoolYear: number;
}): ('maths' | 'spelling')[] {
  if (opts.explicit) return [opts.explicit];
  return opts.headphones && spellingReady(opts.schoolYear) ? ['maths', 'spelling'] : ['maths'];
}

// T2 — transparent encoding. Long-vowel / single-consonant words spelled as sounded.
// Excludes EVERY T3/T4 ambiguity by construction: no consonant doubling (T3), no sj/tj/j/
// ng (T4), no o-å or short e-ä vowel-quality traps (T4). The 2-syllable words (sida, resa,
// läsa …) deliberately SHOW the long-vowel/single-consonant shape that T3 will contrast.
export const T2_WORDS: WordPool = {
  practice: [
    'bil', 'gris', 'pris', 'ris', 'lim', 'tid', 'liv', 'hus', 'mus', 'ben',
    'ren', 'sten', 'rik', 'is', 'lek', 'sida', 'resa', 'fara', 'gata',
    'läsa', 'näsa', 'äta', 'rita',
  ],
  holdout: ['ny', 'by', 'sy', 'yta', 'räv', 'träd', 'fira', 'rida', 'leva', 'myra', 'leka'],
};

// T3 — vowel length / consonant doubling. Minimal pairs whose ONLY audible difference is
// vowel length (short vowel ⇒ doubled consonant). PRACTICE and HOLDOUT use DIFFERENT pairs,
// so a sprint on the holdout pairs measures the rule, not memorised practice words.
// ⚠️ HELD: T3 requires recorded human audio (A12 — vowel length is exactly where TTS
// drifts). Not wired into the delivered graph until the manifest recordings are in hand.
export const T3_PAIRS: readonly { short: string; long: string }[] = [
  { short: 'vitt', long: 'vit' }, { short: 'matt', long: 'mat' }, { short: 'hall', long: 'hal' },
  { short: 'tack', long: 'tak' }, { short: 'full', long: 'ful' }, { short: 'sill', long: 'sil' },
  { short: 'lamm', long: 'lam' }, { short: 'tall', long: 'tal' }, { short: 'villa', long: 'vila' },
  { short: 'fett', long: 'fet' }, { short: 'hett', long: 'het' },
];
export const T3_WORDS: WordPool = {
  // 8 pairs for practice, 3 held back for the generalization sprint.
  practice: T3_PAIRS.slice(0, 8).flatMap((p) => [p.long, p.short]),
  holdout: T3_PAIRS.slice(8).flatMap((p) => [p.long, p.short]),
};

// Which pool backs each spelling skill code. A skill absent here is not a word-dictation
// skill. T3 is now registered — its recorded audio is in public/audio/spelling/t3/.
export const SPELLING_POOLS: Record<string, WordPool> = {
  spelling_t2: T2_WORDS,
  spelling_t3: T3_WORDS,
};

// The pre-literate RECOGNITION pool (T0/T1 tiers): picturable, Erik-vetted words, each with its
// /emoji/<file>.png and its INITIAL-SOUND group key (Swedish sound, not the English emoji name —
// e.g. key→nyckel is /n/). T0 (initial-sound match) picks a target + distractors from OTHER
// groups; T1 (word → first letter) uses the same words, answer = first letter. Isolated audio
// (no carrier sentence) lives in public/audio/spelling/recog/<word>.mp3.
export type RecogWord = { word: string; emoji: string; initial: string };
export const RECOG_WORDS: readonly RecogWord[] = [
  { word: 'sol', emoji: 'sun', initial: 's' }, { word: 'sax', emoji: 'scissors', initial: 's' },
  { word: 'mus', emoji: 'mouse', initial: 'm' }, { word: 'måne', emoji: 'crescent_moon', initial: 'm' }, { word: 'mango', emoji: 'mango', initial: 'm' },
  { word: 'bil', emoji: 'car', initial: 'b' }, { word: 'banan', emoji: 'banana', initial: 'b' }, { word: 'buss', emoji: 'bus', initial: 'b' }, { word: 'båt', emoji: 'sailboat', initial: 'b' },
  { word: 'hund', emoji: 'dog', initial: 'h' }, { word: 'häst', emoji: 'horse', initial: 'h' }, { word: 'hus', emoji: 'house', initial: 'h' },
  { word: 'katt', emoji: 'cat', initial: 'k' }, { word: 'ko', emoji: 'cow', initial: 'k' }, { word: 'koala', emoji: 'koala', initial: 'k' },
  { word: 'fisk', emoji: 'fish', initial: 'f' }, { word: 'fågel', emoji: 'bird', initial: 'f' }, { word: 'flygplan', emoji: 'airplane', initial: 'f' },
  { word: 'tåg', emoji: 'train', initial: 't' }, { word: 'tomat', emoji: 'tomato', initial: 't' }, { word: 'traktor', emoji: 'tractor', initial: 't' },
  { word: 'penna', emoji: 'pencil', initial: 'p' }, { word: 'panda', emoji: 'panda', initial: 'p' }, { word: 'pizza', emoji: 'pizza', initial: 'p' },
  { word: 'gris', emoji: 'pig', initial: 'g' }, { word: 'groda', emoji: 'frog', initial: 'g' },
  { word: 'räv', emoji: 'fox', initial: 'r' }, { word: 'ros', emoji: 'rose', initial: 'r' }, { word: 'ris', emoji: 'rice', initial: 'r' }, { word: 'raket', emoji: 'rocket', initial: 'r' },
  { word: 'val', emoji: 'whale', initial: 'v' }, { word: 'våg', emoji: 'wave', initial: 'v' },
  { word: 'nyckel', emoji: 'key', initial: 'n' },
  { word: 'drake', emoji: 'kite', initial: 'd' }, { word: 'delfin', emoji: 'dolphin', initial: 'd' },
  { word: 'äpple', emoji: 'apple', initial: 'ä' }, { word: 'ägg', emoji: 'egg', initial: 'ä' },
];

// The LETTER pad's glyphs for a spelling item (A6.1): the TIER's letters PLUS distractors,
// never the item's exact letters (no permutation-puzzle leak). A fixed Swedish lower-case set
// covers T2/T3 and hides which letters the answer uses.
export const SPELLING_LETTERS: readonly string[] = 'abdefghiklmnoprstuvyåäö'.split('');

// How a spelling item's word is delivered to the ear. T3 (vowel LENGTH) needs the recorded
// human voice (TTS can't be trusted — A12); T2 (transparent) ships on browser TTS. The client
// plays this and NEVER shows the word (it's dictation). The word comes from buildItem.
// T3 words that keep Erik's HUMAN recording instead of the Sofie clip — the per-pair fallback
// for any minimal pair where the neural voice doesn't render the vowel-length contrast cleanly.
// Add BOTH members of a pair together (never split a pair across voices — the voice difference
// would cue the answer). Empty = all-Sofie, pending Erik's full ear-vet of the 11 pairs.
const HUMAN_T3 = new Set<string>([]);

export function spellingAudio(code: string, word: string): { kind: 'file'; url: string } | { kind: 'tts' } {
  const w = encodeURIComponent(word); // robust for å/ä/ö in the static path
  // Both tiers ship PRE-GENERATED neural clips (Sofie, sv-SE) served as files, so every device
  // hears the identical word — no per-device browser-TTS variance. Sofie was ear-vetted on the
  // T3 vowel-length pairs (vit/vitt …) and renders the contrast the old browser TTS couldn't
  // (A12 relaxed by measurement, not assumption). Erik's human .wav recordings are kept in the
  // repo as a per-pair fallback — HUMAN_T3 flips any word back to the recorded take. The 'tts'
  // branch remains only as a fallback for a spelling code with no audio yet.
  if (code === 'spelling_t3') {
    return HUMAN_T3.has(word)
      ? { kind: 'file', url: `/audio/spelling/t3/${w}.wav` }
      : { kind: 'file', url: `/audio/spelling/t3/${w}.mp3` };
  }
  if (code === 'spelling_t2') return { kind: 'file', url: `/audio/spelling/t2/${w}.mp3` };
  // Recognition tiers (t0/t1…) all play the ISOLATED word (no carrier sentence) from /recog/.
  if (code.startsWith('spelling_t1') || code.startsWith('spelling_t0')) return { kind: 'file', url: `/audio/spelling/recog/${w}.mp3` };
  return { kind: 'tts' };
}

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
