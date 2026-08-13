// English (L1-Swedish) morphographic content — first slice. Real words only (A4). The morphograph
// is the tool skill; an untaught word is the composite that adduces (component→composite). This
// slice is the -ed morphograph with the NO-CHANGE and CONSONANT-DOUBLING joining rules, plus the
// irregular past as its LEXICAL residue — the -ed/went split, tagged before content (A3).
//
// Two structural invariants carry the pedagogy:
//  • RULE node (en_ed_regular): a DISJOINT holdout, so a fluency crossing means the child
//    GENERALIZED the rule to unseen verbs, not memorised a list.
//  • LEXICAL node (en_past_irregular): a CLOSED set (holdout mirrors practice); the word IS the
//    skill, repetition is correct, there is no rule to generalize.
//
// L1-Swedish INTERFERENCE front-loaded (the reason this port beats a generic ESL pack): -ed is
// spelled -ed regardless of its /t/,/d/,/ɪd/ sound (Swedish past is -de/-te, so learners write
// "walkt"); English CVC doubling (stop→stopped) keys on a DIFFERENT trigger than Swedish doubling
// (vowel length), so learners under/over-double. Cognates that transfer ride for free.
//
// Placement note: these children are L2-English BEGINNERS regardless of their Swedish grade, so
// English seeds from a beginner level (subjectSeedGrade → 0) and is offered only from
// ENGLISH_MIN_YEAR up. The `year` on an English skill is an ENGLISH difficulty rung, not a Swedish
// curriculum year.

import type { WordPool } from './spelling-content';

// English on-ramp (docs/english-onramp-spec.md): the RECEPTIVE tier (hear a word → tap the picture,
// no letters) is first contact and is offered to EVERYONE with headphones — including the youngest —
// exactly like Swedish recognition. The p-band + the grade-0 English seed keep each child at their own
// rung. (The PRINT/PRODUCTION tier — spelling, the -ed morphograph — must still be reading-gated; that
// gate is ENGLISH_PRINT_MIN_YEAR below, wired when Phase D/E lands. For now those rungs sit LOCKED
// behind the whole receptive chain, so a pre-literate child can't reach them yet regardless.)
export function englishReady(_schoolYear: number): boolean {
  return true;
}
// Reading gate for the PRODUCTION/PRINT English rungs (Phase D+). Not yet wired — the receptive chain
// gates them for now; this is the honest-proxy floor for when print rungs go live. See the spec.
export const ENGLISH_PRINT_MIN_YEAR = 1;

// ── Receptive vocabulary (Phase A): hear an English word → tap its PICTURE ──────────────────────
// A concrete-noun pool carrying a /public/emoji/<emoji>.png filename stem (same render path as the
// Swedish recognition pictures). `cognate` = a transparent SV↔EN cognate (the floor rung's easy wins);
// `category` drives the same-category distractor rung. Erik's wish: bias toward words that double as
// PROGRAMMING vocabulary where they're still good first-contact nouns (key, tree, gear, map, bell,
// anchor, package…); the action verbs (run/stop/wait…) and keywords (if/for/while…) land in Phases C+.
export type EnNoun = { word: string; emoji: string; cognate: boolean; category: 'animal' | 'food' | 'thing' | 'nature' };
export const EN_NOUNS: readonly EnNoun[] = [
  // transparent cognates — the floor's easy wins
  { word: 'apple', emoji: 'apple', cognate: true, category: 'food' },
  { word: 'banana', emoji: 'banana', cognate: true, category: 'food' },
  { word: 'tomato', emoji: 'tomato', cognate: true, category: 'food' },
  { word: 'pizza', emoji: 'pizza', cognate: true, category: 'food' },
  { word: 'rice', emoji: 'rice', cognate: true, category: 'food' },
  { word: 'house', emoji: 'house', cognate: true, category: 'thing' },
  { word: 'fish', emoji: 'fish', cognate: true, category: 'animal' },
  { word: 'rose', emoji: 'rose', cognate: true, category: 'nature' },
  { word: 'panda', emoji: 'panda', cognate: true, category: 'animal' },
  { word: 'koala', emoji: 'koala', cognate: true, category: 'animal' },
  { word: 'elephant', emoji: 'elephant', cognate: true, category: 'animal' },
  { word: 'giraffe', emoji: 'giraffe', cognate: true, category: 'animal' },
  { word: 'zebra', emoji: 'zebra', cognate: true, category: 'animal' },
  // non-cognate core + PROGRAMMING nouns (★)
  { word: 'cat', emoji: 'cat', cognate: false, category: 'animal' },
  { word: 'dog', emoji: 'dog', cognate: false, category: 'animal' },
  { word: 'bird', emoji: 'bird', cognate: false, category: 'animal' },
  { word: 'cow', emoji: 'cow', cognate: false, category: 'animal' },
  { word: 'duck', emoji: 'duck', cognate: false, category: 'animal' },
  { word: 'owl', emoji: 'owl', cognate: false, category: 'animal' },
  { word: 'bear', emoji: 'bear', cognate: false, category: 'animal' },
  { word: 'fox', emoji: 'fox', cognate: false, category: 'animal' },
  { word: 'sun', emoji: 'sun', cognate: false, category: 'nature' },
  { word: 'star', emoji: 'star', cognate: false, category: 'nature' },
  { word: 'car', emoji: 'car', cognate: false, category: 'thing' },
  { word: 'ship', emoji: 'ship', cognate: false, category: 'thing' },
  { word: 'key', emoji: 'key', cognate: false, category: 'thing' }, // ★ dict key
  { word: 'tree', emoji: 'deciduous_tree', cognate: false, category: 'nature' }, // ★ data structure
  { word: 'gear', emoji: 'gear', cognate: false, category: 'thing' }, // ★ settings
  { word: 'map', emoji: 'world_map', cognate: false, category: 'thing' }, // ★ hashmap
  { word: 'bell', emoji: 'bell', cognate: false, category: 'thing' }, // ★ event/notification
  { word: 'ladder', emoji: 'ladder', cognate: false, category: 'thing' },
  { word: 'anchor', emoji: 'anchor', cognate: false, category: 'thing' }, // ★ git anchor
  { word: 'package', emoji: 'package', cognate: false, category: 'thing' }, // ★ npm package
];
export const EN_NOUN_WORDS: readonly string[] = EN_NOUNS.map((n) => n.word);

type NounRng = { int(a: number, b: number): number; pick<T>(xs: readonly T[]): T };
const shuffle = <T>(r: NounRng, xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = r.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// One receptive item: a target word + two distractors, per discrimination mode. The correct picture
// IS the word played (direct comprehension). Modes are the Phase-A seams:
//  cognate  — target is a cognate; distractors from a DIFFERENT category (easy, unrelated pictures)
//  core     — target is non-cognate; distractors different category
//  category — distractors SAME category (finer meaning discrimination)
//  onset    — distractors share the first letter/sound (English sound discrimination)
// Distractor candidates fall back (→ any other word) so every target yields a full 3-option set.
export function enNounItem(r: NounRng, mode: 'cognate' | 'core' | 'category' | 'onset'): { target: EnNoun; options: EnNoun[] } {
  const pool = EN_NOUNS;
  const target =
    mode === 'cognate' ? r.pick(pool.filter((w) => w.cognate))
    : mode === 'core' ? r.pick(pool.filter((w) => !w.cognate))
    : r.pick(pool);
  const primary =
    mode === 'category' ? pool.filter((w) => w.category === target.category && w.word !== target.word)
    : mode === 'onset' ? pool.filter((w) => w.word[0] === target.word[0] && w.word !== target.word)
    : pool.filter((w) => w.category !== target.category); // unrelated: a different category reads as clearly different
  const backfill = pool.filter((w) => w.word !== target.word && !primary.includes(w));
  const distractors = [...shuffle(r, primary), ...shuffle(r, backfill)].slice(0, 2);
  return { target, options: shuffle(r, [target, ...distractors]) };
}

// ── Phase B (increment 1): COLOURS — hear a colour word → tap the colour. No image asset: the option
// renders as a CSS-fill swatch (render:'swatch'). Programming-relevant (colour values), and clean
// vocabulary the youngest can do. (Attributes, two-word recombination, and Phase-C verbs/frames need
// an action/attribute IMAGE set that the emoji pool lacks — a separate asset step; see the spec.)
export type EnColor = { word: string; color: string };
export const EN_COLORS: readonly EnColor[] = [
  { word: 'red', color: '#e23b2e' },
  { word: 'green', color: '#2ea44f' },
  { word: 'blue', color: '#2f6fdb' },
  { word: 'yellow', color: '#f2c73d' },
  { word: 'orange', color: '#ef7d1a' },
  { word: 'purple', color: '#8b5cf6' },
  { word: 'pink', color: '#ec6ec0' },
  { word: 'brown', color: '#8a5a2b' },
];
export const EN_COLOR_WORDS: readonly string[] = EN_COLORS.map((c) => c.word);

export function enColorItem(r: NounRng): { target: EnColor; options: EnColor[] } {
  const target = r.pick(EN_COLORS);
  const distractors = shuffle(r, EN_COLORS.filter((c) => c.word !== target.word)).slice(0, 2);
  return { target, options: shuffle(r, [target, ...distractors]) };
}

// ── Phase C (increment 1): ACTION VERBS — hear a verb → tap the pictogram (TPR: hear→point). The
// emoji photo-set has no actions, so these render as authored SVGs (/public/pictos/<picto>.svg,
// render:'picto'). Erik's wish: programming-relevant verbs (run, stop, open, look…). Prop-supported
// so each reads at small size (bed→sleep, chair→sit, octagon→stop, eye→look). First set of 8; a
// pre-literate child does these receptively long before producing any -ed.
export type EnVerb = { word: string; picto: string; ing: string };
export const EN_VERBS: readonly EnVerb[] = [
  { word: 'run', picto: 'run', ing: 'running' }, // CVC doubling
  { word: 'jump', picto: 'jump', ing: 'jumping' },
  { word: 'sit', picto: 'sit', ing: 'sitting' }, // CVC doubling
  { word: 'sleep', picto: 'sleep', ing: 'sleeping' },
  { word: 'eat', picto: 'eat', ing: 'eating' },
  { word: 'stop', picto: 'stop', ing: 'stopping' }, // CVC doubling
  { word: 'open', picto: 'open', ing: 'opening' },
  { word: 'look', picto: 'look', ing: 'looking' },
];
export const EN_VERB_WORDS: readonly string[] = EN_VERBS.map((v) => v.word);
export const EN_VERB_ING_WORDS: readonly string[] = EN_VERBS.map((v) => v.ing);

export function enVerbItem(r: NounRng): { target: EnVerb; options: EnVerb[] } {
  const target = r.pick(EN_VERBS);
  const distractors = shuffle(r, EN_VERBS.filter((v) => v.word !== target.word)).slice(0, 2);
  return { target, options: shuffle(r, [target, ...distractors]) };
}

// ── Phase B (increment 2): ATTRIBUTES — hear an attribute → tap the pictogram (SVG, render:'picto').
// Taught in CONTRASTIVE PAIRS (`pair`): the partner is always an option, so a RELATIVE attribute (big
// only means "big" next to "small") always has its contrast on screen — the DI discrimination move.
// Self-evident icons (arrows, faces, sun/snowflake) carry the rest. Programming-adjacent: up/down.
export type EnAttr = { word: string; picto: string; pair: string };
export const EN_ATTRS: readonly EnAttr[] = [
  { word: 'big', picto: 'big', pair: 'size' },
  { word: 'small', picto: 'small', pair: 'size' },
  { word: 'up', picto: 'up', pair: 'dir' },
  { word: 'down', picto: 'down', pair: 'dir' },
  { word: 'happy', picto: 'happy', pair: 'mood' },
  { word: 'sad', picto: 'sad', pair: 'mood' },
  { word: 'hot', picto: 'hot', pair: 'temp' },
  { word: 'cold', picto: 'cold', pair: 'temp' },
];
export const EN_ATTR_WORDS: readonly string[] = EN_ATTRS.map((a) => a.word);

export function enAttrItem(r: NounRng): { target: EnAttr; options: EnAttr[] } {
  const target = r.pick(EN_ATTRS);
  const partner = EN_ATTRS.find((a) => a.pair === target.pair && a.word !== target.word)!; // the contrast, always shown
  const other = r.pick(EN_ATTRS.filter((a) => a.pair !== target.pair));
  return { target, options: shuffle(r, [target, partner, other]) };
}

// ── Phase B (increment 3): TWO-WORD recombination — hear "big cat" → tap the big cat. The first
// GENERATIVE composite: bind a known attribute (size) to a known noun. Rendered by SCALING the noun
// emoji (render:'sizednoun') — no new asset. Distractors flip the size (same noun) and the noun, so
// the child must get BOTH right. (Colour+noun would need colour-tinted art; size composes for free.)
const TWOWORD_NOUNS = [
  { word: 'cat', emoji: 'cat' }, { word: 'dog', emoji: 'dog' }, { word: 'fish', emoji: 'fish' },
  { word: 'star', emoji: 'star' }, { word: 'apple', emoji: 'apple' }, { word: 'house', emoji: 'house' },
] as const;
export type EnTwoWord = { phrase: string; emoji: string; big: boolean };
const twoWord = (n: { word: string; emoji: string }, big: boolean): EnTwoWord => ({ phrase: `${big ? 'big' : 'small'} ${n.word}`, emoji: n.emoji, big });
export function enTwoWordItem(r: NounRng): { target: EnTwoWord; options: EnTwoWord[] } {
  const noun = r.pick(TWOWORD_NOUNS);
  const big = r.int(0, 1) === 0;
  const target = twoWord(noun, big);
  const partner = twoWord(noun, !big); // same noun, the OTHER size
  const other = twoWord(r.pick(TWOWORD_NOUNS.filter((n) => n.word !== noun.word)), r.int(0, 1) === 0);
  return { target, options: shuffle(r, [target, partner, other]) };
}
export const EN_TWOWORD_PHRASES: readonly string[] = TWOWORD_NOUNS.flatMap((n) => [`big ${n.word}`, `small ${n.word}`]);

// ── Phase C (increment 3): SVO FRAMES — hear "the dog is running" → tap the agent+action. Generative
// comprehension of a whole clause: the option shows the noun emoji + the verb pictogram (render:
// 'nounverb'); distractors flip the verb (same agent) and the agent (same verb), so binding BOTH is
// required. Reuses the noun emoji + verb pictos — no new asset.
const FRAME_NOUNS = [
  { word: 'dog', emoji: 'dog' }, { word: 'cat', emoji: 'cat' }, { word: 'fish', emoji: 'fish' },
  { word: 'bird', emoji: 'bird' }, { word: 'cow', emoji: 'cow' },
] as const;
const FRAME_VERBS = [
  { picto: 'run', ing: 'running' }, { picto: 'jump', ing: 'jumping' }, { picto: 'eat', ing: 'eating' }, { picto: 'sleep', ing: 'sleeping' },
] as const;
export type EnFrame = { phrase: string; noun: string; verb: string };
const frame = (n: { word: string; emoji: string }, v: { picto: string; ing: string }): EnFrame => ({ phrase: `the ${n.word} is ${v.ing}`, noun: n.emoji, verb: v.picto });
export function enFrameItem(r: NounRng): { target: EnFrame; options: EnFrame[] } {
  const n = r.pick(FRAME_NOUNS);
  const v = r.pick(FRAME_VERBS);
  const target = frame(n, v);
  const diffVerb = frame(n, r.pick(FRAME_VERBS.filter((x) => x.picto !== v.picto))); // same agent, other action
  const diffNoun = frame(r.pick(FRAME_NOUNS.filter((x) => x.word !== n.word)), v); // other agent, same action
  return { target, options: shuffle(r, [target, diffVerb, diffNoun]) };
}
export const EN_FRAME_PHRASES: readonly string[] = FRAME_NOUNS.flatMap((n) => FRAME_VERBS.map((v) => `the ${n.word} is ${v.ing}`));

// The English letter pad: a–z only (no å ä ö; canonical is lower-case, A16).
export const ENGLISH_LETTERS: readonly string[] = 'abcdefghijklmnopqrstuvwxyz'.split('');

// -ed regular past (RULE). PRACTICE teaches BOTH joining rules (no-change + consonant-doubling);
// HOLDOUT is DISJOINT verbs across the SAME two rules, so a sprint crossing = generalization.
export const EN_ED_REGULAR: WordPool = {
  practice: [
    // no-change: base + ed (across /t/, /d/, /ɪd/ endings — all spelled -ed)
    'played', 'walked', 'jumped', 'wanted', 'looked', 'opened', 'cleaned', 'helped', 'called', 'asked',
    'worked', 'painted', 'waited', 'started', 'needed', 'rained', 'cooked', 'counted', 'talked', 'showed',
    // consonant doubling: CVC + ed
    'stopped', 'planned', 'grabbed', 'dropped', 'clapped', 'hugged',
  ],
  holdout: [
    // no-change (unseen verbs)
    'turned', 'followed', 'listened', 'watched', 'learned', 'joined', 'visited', 'added',
    // doubling (unseen CVC verbs)
    'nodded', 'patted', 'shopped', 'begged', 'jogged', 'slipped',
  ],
};

// Irregular past (LEXICAL) — a closed set of high-frequency irregulars that do NOT take -ed. The
// word is the skill; holdout mirrors practice so a fluency sprint repeats the forms (retrieval,
// not generalization). These are exactly the verbs a Swedish learner tends to regularize (goed*).
const IRREGULAR_PAST: readonly string[] = [
  'went', 'saw', 'made', 'took', 'came', 'got', 'gave', 'found', 'told', 'knew',
  'felt', 'left', 'kept', 'held', 'brought', 'thought', 'bought', 'caught', 'taught', 'ran',
  'sat', 'won', 'met', 'sent', 'built', 'said', 'had', 'did', 'read', 'put',
];
export const EN_PAST_IRREGULAR: WordPool = { practice: IRREGULAR_PAST, holdout: IRREGULAR_PAST };

// Registered into the shared word-dictation pool map (spelling-content) so buildItem's seed→word
// path serves them with no new mechanism.
export const EN_POOLS: Record<string, WordPool> = {
  en_ed_regular: EN_ED_REGULAR,
  en_past_irregular: EN_PAST_IRREGULAR,
};

// rule vs lexical, tagged (A3): a RULE crossing on holdout means generalization; a LEXICAL node is
// fixed retrieval. Carried first-class on Skill.kind and read by the sprint word source.
export const EN_KIND: Record<string, 'rule' | 'lexical'> = {
  en_ed_regular: 'rule',
  en_past_irregular: 'lexical',
};

// English word audio: pre-generated neural clips (en-GB Sonia) in the SAME carrier format as the
// Swedish audio — "word. A sentence with the word. word." — so short words (won, met, put) are
// unambiguous even when clearly pronounced. Served as files, so every device hears the identical
// clip. Source text: scripts/spelling-audio/english-sentences.json → generate-english.mjs.
export function englishAudio(word: string): { kind: 'file'; url: string } | { kind: 'tts'; lang: string } {
  return { kind: 'file', url: `/audio/english/${encodeURIComponent(word)}.mp3` };
}
