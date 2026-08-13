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

// ── Phase D: PRINT BRIDGE (needs reading — cross-subject gated). Same noun pick, two directions:
// hear→tap the printed WORD (en_word_recognise), and read the printed word→tap the PICTURE
// (en_word_picture). Sidman equivalence: teach spoken↔print and the picture↔print relation emerges.
export function enWordItem(r: NounRng): { target: EnNoun; options: EnNoun[] } {
  const target = r.pick(EN_NOUNS);
  const distractors = shuffle(r, EN_NOUNS.filter((n) => n.word !== target.word)).slice(0, 2);
  return { target, options: shuffle(r, [target, ...distractors]) };
}

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

// ═══ SENTENCE MODE · the L1-Swedish INTERFERENCE slice ══════════════════════════════════════════
// docs/english-sentence-mode-spec.md. The top of the ramp: not vocabulary (Swedish and English
// share too much for that to be hard) but the SENTENCE GRAMMAR where Swedish actively misleads —
// the "Swenglish" errors that survive years of exposure precisely because the Swedish rule is
// automatic. Each rung isolates ONE interference seam and shows it as a MINIMAL PAIR: the Swedish
// pull against the English form, nothing else on screen (the Direct Instruction discrimination
// move). Two options exactly, so a wrong tap IS the interference error — the question log then
// reads as a diagnosis, not just a miss.
//
// Structural invariants, mirroring EN_ED_REGULAR:
//  • RULE nodes with a DISJOINT holdout — practice and holdout share no sentence, because their
//    CONSTITUENTS (adverbials/subjects/verbs/predicates) are disjoint sets. Sentences are composed
//    combinatorially, so the served item space is far larger than the 12-attempt accuracy window:
//    a crossing cannot be a memorised list, only the rule.
//  • Recognition (format:'choice') ⇒ crosses on ACCURACY (recog_shadow), no fluency coupling.
//  • ONE answer per item by construction (spec §2.5): the options are the correct form and the L1
//    lure, graded through the existing case-insensitive word path. No answer-set grader.
//
// NOTE: these pools are deliberately NOT registered in EN_POOLS. A code in SPELLING_POOLS is
// routed by buildItem to the word-dictation branch (seed → word, letter pad); a sentence rung must
// fall through to generateCanon so its `choice` spec is built. Keep them separate.

// One authored item: the sentence shown, which tongue it is in, the correct English, and the lure
// (the same meaning rendered with the Swedish rule transferred). `text` may carry a `___` cloze gap.
export type EnSentenceSpec = { text: string; lang: 'sv' | 'en'; answer: string; lure: string };
export type EnSentencePool = { question: string; practice: readonly EnSentenceSpec[]; holdout: readonly EnSentenceSpec[] };

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const j = (...parts: (string | undefined)[]): string => parts.filter((p) => p && p.length).join(' ');

// ── S1 · V2 / no inversion after a fronted adverbial ────────────────────────────────────────────
// Swedish is a verb-second language: front an adverbial and the subject moves BEHIND the verb
// ("Idag äter jag…"). English does not invert ("Today I eat…"). Transferred, it yields the single
// most persistent Swedish-English error. The Swedish sentence carries the meaning; the two options
// are the English word orders. Composed adverbial × clause.
type EnAdverbial = { sv: string; en: string };
type EnOrderClause = { svVerb: string; svSubj: string; svRest?: string; enSubj: string; enVerb: string; enRest?: string };
const orderSpecs = (advs: readonly EnAdverbial[], clauses: readonly EnOrderClause[]): EnSentenceSpec[] =>
  advs.flatMap((a) =>
    clauses.map((c) => ({
      text: `${cap(j(a.sv, c.svVerb, c.svSubj, c.svRest))}.`,
      lang: 'sv' as const,
      answer: `${cap(j(a.en, c.enSubj, c.enVerb, c.enRest))}.`, // English: adverbial, then SUBJECT, then verb
      lure: `${cap(j(a.en, c.enVerb, c.enSubj, c.enRest))}.`, // the Swedish V2 order, transferred
    })),
  );

const ORDER_ADVS_PRACTICE: readonly EnAdverbial[] = [
  { sv: 'idag', en: 'today' }, { sv: 'imorgon', en: 'tomorrow' }, { sv: 'sedan', en: 'then' },
  { sv: 'ibland', en: 'sometimes' }, { sv: 'varje dag', en: 'every day' },
];
const ORDER_CLAUSES_PRACTICE: readonly EnOrderClause[] = [
  { svVerb: 'äter', svSubj: 'jag', svRest: 'ett äpple', enSubj: 'I', enVerb: 'eat', enRest: 'an apple' },
  { svVerb: 'springer', svSubj: 'hunden', enSubj: 'the dog', enVerb: 'runs' },
  { svVerb: 'sover', svSubj: 'katten', enSubj: 'the cat', enVerb: 'sleeps' },
  { svVerb: 'leker', svSubj: 'vi', enSubj: 'we', enVerb: 'play' },
  { svVerb: 'hoppar', svSubj: 'fågeln', enSubj: 'the bird', enVerb: 'jumps' },
  { svVerb: 'läser', svSubj: 'jag', svRest: 'en bok', enSubj: 'I', enVerb: 'read', enRest: 'a book' },
  { svVerb: 'ser', svSubj: 'jag', svRest: 'en stjärna', enSubj: 'I', enVerb: 'see', enRest: 'a star' },
  { svVerb: 'dricker', svSubj: 'vi', svRest: 'mjölk', enSubj: 'we', enVerb: 'drink', enRest: 'milk' },
];
// HOLDOUT: different adverbials AND different clauses ⇒ no sentence can coincide with practice.
const ORDER_ADVS_HOLDOUT: readonly EnAdverbial[] = [
  { sv: 'på måndag', en: 'on Monday' }, { sv: 'på morgonen', en: 'in the morning' },
  { sv: 'efter skolan', en: 'after school' }, { sv: 'hemma', en: 'at home' }, { sv: 'på lördag', en: 'on Saturday' },
];
const ORDER_CLAUSES_HOLDOUT: readonly EnOrderClause[] = [
  { svVerb: 'öppnar', svSubj: 'jag', svRest: 'dörren', enSubj: 'I', enVerb: 'open', enRest: 'the door' },
  { svVerb: 'simmar', svSubj: 'fisken', enSubj: 'the fish', enVerb: 'swims' },
  { svVerb: 'köper', svSubj: 'vi', svRest: 'glass', enSubj: 'we', enVerb: 'buy', enRest: 'ice cream' },
  { svVerb: 'tittar', svSubj: 'jag', svRest: 'på en film', enSubj: 'I', enVerb: 'watch', enRest: 'a film' },
  { svVerb: 'bakar', svSubj: 'mamma', svRest: 'en kaka', enSubj: 'mum', enVerb: 'bakes', enRest: 'a cake' },
];

// ── S2 · do-support in QUESTIONS ────────────────────────────────────────────────────────────────
// Swedish makes a question by inverting the verb and subject and adds nothing ("Talar du
// engelska?"). English needs the dummy DO ("Do you speak English?"); transferred, the learner
// produces "Speak you English?". Subjects are kept non-3rd-person so the seam is do-support ALONE
// (does/-s agreement is a different seam and would blur this one).
type EnSubject = { sv: string; en: string };
type EnPredicate = { svVerb: string; svRest?: string; enVerb: string; enRest?: string };
const questionSpecs = (subjs: readonly EnSubject[], preds: readonly EnPredicate[]): EnSentenceSpec[] =>
  subjs.flatMap((s) =>
    preds.map((p) => ({
      text: `${cap(j(p.svVerb, s.sv, p.svRest))}?`,
      lang: 'sv' as const,
      answer: `${cap(j('do', s.en, p.enVerb, p.enRest))}?`,
      lure: `${cap(j(p.enVerb, s.en, p.enRest))}?`, // Swedish inversion, no DO
    })),
  );

const Q_SUBJ_PRACTICE: readonly EnSubject[] = [{ sv: 'du', en: 'you' }, { sv: 'vi', en: 'we' }, { sv: 'de', en: 'they' }];
const Q_PRED_PRACTICE: readonly EnPredicate[] = [
  { svVerb: 'talar', svRest: 'engelska', enVerb: 'speak', enRest: 'English' },
  { svVerb: 'gillar', svRest: 'katter', enVerb: 'like', enRest: 'cats' },
  { svVerb: 'äter', svRest: 'äpplen', enVerb: 'eat', enRest: 'apples' },
  { svVerb: 'ser', svRest: 'hunden', enVerb: 'see', enRest: 'the dog' },
  { svVerb: 'kommer', svRest: 'imorgon', enVerb: 'come', enRest: 'tomorrow' },
  { svVerb: 'behöver', svRest: 'hjälp', enVerb: 'need', enRest: 'help' },
];
const Q_SUBJ_HOLDOUT: readonly EnSubject[] = [{ sv: 'barnen', en: 'the children' }, { sv: 'dina kompisar', en: 'your friends' }];
const Q_PRED_HOLDOUT: readonly EnPredicate[] = [
  { svVerb: 'läser', svRest: 'böcker', enVerb: 'read', enRest: 'books' },
  { svVerb: 'spelar', svRest: 'fotboll', enVerb: 'play', enRest: 'football' },
  { svVerb: 'dricker', svRest: 'mjölk', enVerb: 'drink', enRest: 'milk' },
  { svVerb: 'känner', svRest: 'min syster', enVerb: 'know', enRest: 'my sister' },
];

// ── S3 · do-support in NEGATION ─────────────────────────────────────────────────────────────────
// Swedish negates by putting *inte* AFTER the verb ("Jag gillar inte katter"). English needs DO +
// n't BEFORE it ("I don't like cats"); transferred, the learner produces "I like not cats". Same
// non-3rd-person restriction as S2, so the contrast is don't-vs-not and nothing else.
const negationSpecs = (subjs: readonly EnSubject[], preds: readonly EnPredicate[]): EnSentenceSpec[] =>
  subjs.flatMap((s) =>
    preds.map((p) => ({
      text: `${cap(j(s.sv, p.svVerb, 'inte', p.svRest))}.`,
      lang: 'sv' as const,
      answer: `${cap(j(s.en, "don't", p.enVerb, p.enRest))}.`,
      lure: `${cap(j(s.en, p.enVerb, 'not', p.enRest))}.`, // *inte* after the verb, transferred
    })),
  );

const N_SUBJ_PRACTICE: readonly EnSubject[] = [{ sv: 'jag', en: 'I' }, { sv: 'vi', en: 'we' }, { sv: 'de', en: 'they' }];
const N_PRED_PRACTICE: readonly EnPredicate[] = [
  { svVerb: 'gillar', svRest: 'katter', enVerb: 'like', enRest: 'cats' },
  { svVerb: 'äter', svRest: 'kött', enVerb: 'eat', enRest: 'meat' },
  { svVerb: 'ser', svRest: 'hunden', enVerb: 'see', enRest: 'the dog' },
  { svVerb: 'förstår', enVerb: 'understand' },
  { svVerb: 'vet', enVerb: 'know' },
  { svVerb: 'har', svRest: 'tid', enVerb: 'have', enRest: 'time' },
];
const N_SUBJ_HOLDOUT: readonly EnSubject[] = [{ sv: 'barnen', en: 'the children' }, { sv: 'mina kompisar', en: 'my friends' }];
const N_PRED_HOLDOUT: readonly EnPredicate[] = [
  { svVerb: 'dricker', svRest: 'kaffe', enVerb: 'drink', enRest: 'coffee' },
  { svVerb: 'hör', svRest: 'musiken', enVerb: 'hear', enRest: 'the music' },
  { svVerb: 'läser', svRest: 'tidningen', enVerb: 'read', enRest: 'the newspaper' },
  { svVerb: 'behöver', svRest: 'hjälp', enVerb: 'need', enRest: 'help' },
];

// ── S4 · continuous vs simple aspect ────────────────────────────────────────────────────────────
// Swedish has no continuous: "Titta, det regnar!" is the same present tense as "Det regnar varje
// dag". English splits them, and the CUE decides ("now"/"Look!" ⇒ is -ing; "every day" ⇒ simple).
// So this rung is a CLOZE, in English: the gap hides the verb, both options carry the SAME verb,
// and only the form differs — the seam is aspect alone. Both directions are taught (a cue that
// forces the simple form is served too), because the skill is the DISCRIMINATION, not one form.
// The -ing forms are the ones already met receptively in en_verb_ing.
type EnAspectSubject = { en: string; be: 'is' | 'am' | 'are'; third: boolean };
type EnAspectVerb = { base: string; ing: string; s: string };
type EnAspectCue = { en: string; cont: boolean; lead?: boolean }; // lead ⇒ the cue opens the sentence
const aspectSpecs = (subjs: readonly EnAspectSubject[], verbs: readonly EnAspectVerb[], cues: readonly EnAspectCue[]): EnSentenceSpec[] =>
  subjs.flatMap((s) =>
    verbs.flatMap((v) =>
      cues.map((c) => {
        const continuous = `${s.be} ${v.ing}`;
        const simple = s.third ? v.s : v.base;
        return {
          text: c.lead ? `${c.en} ${cap(s.en)} ___.` : `${cap(s.en)} ___ ${c.en}.`,
          lang: 'en' as const,
          answer: c.cont ? continuous : simple,
          lure: c.cont ? simple : continuous, // the Swedish default is the simple form for BOTH
        };
      }),
    ),
  );

const ASPECT_SUBJ_PRACTICE: readonly EnAspectSubject[] = [
  { en: 'the dog', be: 'is', third: true }, { en: 'the cat', be: 'is', third: true },
  { en: 'I', be: 'am', third: false }, { en: 'we', be: 'are', third: false },
];
const ASPECT_VERBS_PRACTICE: readonly EnAspectVerb[] = [
  { base: 'run', ing: 'running', s: 'runs' }, { base: 'sleep', ing: 'sleeping', s: 'sleeps' },
  { base: 'play', ing: 'playing', s: 'plays' }, { base: 'jump', ing: 'jumping', s: 'jumps' },
  { base: 'eat', ing: 'eating', s: 'eats' },
];
const ASPECT_SUBJ_HOLDOUT: readonly EnAspectSubject[] = [
  { en: 'the bird', be: 'is', third: true }, { en: 'my sister', be: 'is', third: true },
  { en: 'the children', be: 'are', third: false }, { en: 'they', be: 'are', third: false },
];
const ASPECT_VERBS_HOLDOUT: readonly EnAspectVerb[] = [
  { base: 'sit', ing: 'sitting', s: 'sits' }, { base: 'work', ing: 'working', s: 'works' },
  { base: 'read', ing: 'reading', s: 'reads' }, { base: 'swim', ing: 'swimming', s: 'swims' },
  { base: 'wait', ing: 'waiting', s: 'waits' },
];
// The cue set is SHARED between practice and holdout on purpose: the cue IS the rule's trigger, so
// the generalization axis is the unseen subject/verb, not an unseen cue. Disjoint subjects AND
// verbs already make the two sentence sets disjoint.
const ASPECT_CUES: readonly EnAspectCue[] = [
  { en: 'Look!', cont: true, lead: true }, { en: 'now', cont: true }, { en: 'right now', cont: true },
  { en: 'every day', cont: false }, { en: 'on Mondays', cont: false },
];

// Every S5-S8 item is an English CLOZE: read the sentence, pick the word that fills the gap.
const cloze = (text: string, answer: string, lure: string): EnSentenceSpec => ({ text, lang: 'en', answer, lure });

// ── S5 · PREPOSITIONS (the collocation set) ─────────────────────────────────────────────────────
// Not a rule you can derive — a collocation you must know — but the ERROR is rule-like: the L1
// default preposition mis-transfers, and *på* is the worst offender (bra på, lyssna på, titta på,
// vänta på, tänka på, på bilden all become "on"). So each item is an English cloze and the lure is
// the preposition the Swedish phrase would hand you. Kept RULE-shaped with a disjoint holdout: the
// holdout is UNSEEN collocations of the same interference classes, so a crossing means the child
// generalized the discrimination "the Swedish preposition is not the English one", not eight facts.
// Three carrier sentences per collocation, so the answer can't be keyed to a memorised sentence.
const PREP_PRACTICE: readonly EnSentenceSpec[] = [
  // bra PÅ → good AT
  cloze('My sister is good ___ football.', 'at', 'on'),
  cloze('The cat is good ___ jumping.', 'at', 'on'),
  cloze('Are you good ___ maths?', 'at', 'on'),
  // lyssna PÅ → listen TO
  cloze('I listen ___ music every day.', 'to', 'on'),
  cloze('Listen ___ me, please.', 'to', 'on'),
  cloze('We listen ___ the radio in the car.', 'to', 'on'),
  // titta PÅ → look AT
  cloze('Look ___ the big dog!', 'at', 'on'),
  cloze('She looks ___ the stars at night.', 'at', 'on'),
  cloze("Don't look ___ me like that.", 'at', 'on'),
  // vänta PÅ → wait FOR
  cloze('I wait ___ the bus every morning.', 'for', 'on'),
  cloze('Wait ___ me!', 'for', 'on'),
  cloze('We waited ___ the rain to stop.', 'for', 'on'),
  // tänka PÅ → think ABOUT
  cloze('I think ___ my dog when I am at school.', 'about', 'on'),
  cloze('What do you think ___ the film?', 'about', 'on'),
  cloze('She thinks ___ her holiday.', 'about', 'on'),
  // PÅ bilden → IN the picture
  cloze('There is a cat ___ the picture.', 'in', 'on'),
  cloze('Who is the boy ___ the photo?', 'in', 'on'),
  cloze('I can see three birds ___ the picture.', 'in', 'on'),
  // intresserad AV → interested IN
  cloze('He is interested ___ cars.', 'in', 'of'),
  cloze('Are you interested ___ music?', 'in', 'of'),
  cloze('My mum is interested ___ old houses.', 'in', 'of'),
  // rädd FÖR → afraid OF
  cloze('The mouse is afraid ___ the cat.', 'of', 'for'),
  cloze('I am not afraid ___ the dark.', 'of', 'for'),
  cloze('Are you afraid ___ big dogs?', 'of', 'for'),
];
// HOLDOUT: unseen collocations, same interference classes (a Swedish preposition that is not the
// English one). None of these phrases appears in practice.
const PREP_HOLDOUT: readonly EnSentenceSpec[] = [
  cloze('My dad is angry ___ me.', 'with', 'on'), // arg PÅ
  cloze('She is angry ___ her brother.', 'with', 'on'),
  cloze('I am proud ___ my little sister.', 'of', 'over'), // stolt ÖVER
  cloze('We are proud ___ our school.', 'of', 'over'),
  cloze('I am tired ___ this game.', 'of', 'on'), // trött PÅ
  cloze('She is tired ___ waiting.', 'of', 'on'),
  cloze('My aunt is married ___ a teacher.', 'to', 'with'), // gift MED
  cloze('He is married ___ my cousin.', 'to', 'with'),
  cloze('Please ask ___ help when you need it.', 'for', 'about'), // be OM
  cloze('She asked ___ a glass of water.', 'for', 'about'),
];

// ── S6 · is / get / become (bli) ────────────────────────────────────────────────────────────────
// Swedish *bli* covers become, get, turn and plain be, so the learner reaches for "become"
// everywhere ("I become happy", "I become six"). English splits it: GET for a change of state,
// TURN for an age, BECOME for a profession or a lasting change — which is the item that stops this
// being "never say become": one option set per item, and "become" is sometimes the right one.
// LEXICAL: a closed contrast set; the holdout is unseen frames of the same three classes.
const IS_GET_PRACTICE: readonly EnSentenceSpec[] = [
  cloze('I ___ happy when I see my dog.', 'get', 'become'),
  cloze('My sister ___ angry very fast.', 'gets', 'becomes'),
  cloze('The soup ___ cold on the table.', 'gets', 'becomes'),
  cloze('It ___ dark early in the winter.', 'gets', 'becomes'),
  cloze('I ___ six years old tomorrow.', 'turn', 'become'),
  cloze('My brother ___ ten next week.', 'turns', 'becomes'),
  cloze('He wants to ___ a doctor.', 'become', 'get'),
  cloze('When I grow up I will ___ a teacher.', 'become', 'get'),
  cloze('The little bird ___ hungry.', 'gets', 'becomes'),
  cloze('You ___ wet in the rain.', 'get', 'become'),
  cloze('She ___ eight on Monday.', 'turns', 'becomes'),
  cloze('They want to ___ pilots.', 'become', 'get'),
];
const IS_GET_HOLDOUT: readonly EnSentenceSpec[] = [
  cloze('The sky ___ dark before the rain.', 'gets', 'becomes'),
  cloze('I ___ tired in the evening.', 'get', 'become'),
  cloze('My cousin ___ twelve in June.', 'turns', 'becomes'),
  cloze('She wants to ___ a vet.', 'become', 'get'),
  cloze('The water ___ hot on the stove.', 'gets', 'becomes'),
  cloze('We ___ hungry after school.', 'get', 'become'),
];

// ── S7 · make / do (göra) ───────────────────────────────────────────────────────────────────────
// One Swedish verb, two English ones, split by collocation and nothing else — so this is pure
// discrimination practice. MAKE builds something (a cake, a noise, the bed); DO performs an
// activity (homework, the dishes, your best). LEXICAL: the pairs are the skill.
const MAKE_DO_PRACTICE: readonly EnSentenceSpec[] = [
  cloze('___ your homework before dinner.', 'Do', 'Make'),
  cloze('Can you ___ me a sandwich?', 'make', 'do'),
  cloze('I have to ___ the dishes tonight.', 'do', 'make'),
  cloze('She wants to ___ a cake for my birthday.', 'make', 'do'),
  cloze('Please ___ your bed in the morning.', 'make', 'do'),
  cloze('We always ___ our best.', 'do', 'make'),
  cloze("Don't ___ so much noise!", 'make', 'do'),
  cloze('I will ___ the shopping on Saturday.', 'do', 'make'),
  cloze('He can ___ a paper plane.', 'make', 'do'),
  cloze('Did you ___ the test at school?', 'do', 'make'),
  cloze("Let's ___ a snowman!", 'make', 'do'),
  cloze('I ___ my chores every day.', 'do', 'make'),
];
const MAKE_DO_HOLDOUT: readonly EnSentenceSpec[] = [
  cloze('Can you ___ a cup of tea?', 'make', 'do'),
  cloze('We ___ an experiment in school.', 'did', 'made'),
  cloze('She wants to ___ a wish.', 'make', 'do'),
  cloze('___ the washing up, please.', 'Do', 'Make'),
  cloze('The bees ___ honey.', 'make', 'do'),
  cloze('I ___ nothing all day.', 'did', 'made'),
];

// ── S8 · FALSE FRIENDS ──────────────────────────────────────────────────────────────────────────
// Swedish words that LOOK like an English word with a different meaning. Only airtight pairs are
// used: in every item the lure is unambiguously wrong English, so the one-answer-by-construction
// rule (spec §2.5) holds. (rolig→funny is deliberately absent: "a fun joke" is arguable, so it
// would be the one item with two defensible answers.) LEXICAL, disjoint holdout.
const FALSE_FRIEND_PRACTICE: readonly EnSentenceSpec[] = [
  // lära = learn AND teach
  cloze('My teacher ___ me English.', 'teaches', 'learns'),
  cloze('Can you ___ me to swim?', 'teach', 'learn'),
  cloze('I ___ new words every day.', 'learn', 'teach'),
  // låna = borrow AND lend
  cloze('Can I ___ your pen, please?', 'borrow', 'lend'),
  cloze('Can you ___ me your pen?', 'lend', 'borrow'),
  cloze('I want to ___ a book from the library.', 'borrow', 'lend'),
  // chef = boss, not a cook
  cloze('My mum is the ___ at her work.', 'boss', 'chef'),
  cloze('Who is the ___ of this company?', 'boss', 'chef'),
  // fabrik = factory, not fabric
  cloze('They make cars in a big ___.', 'factory', 'fabric'),
  cloze('My dad works in a ___ near the town.', 'factory', 'fabric'),
  // recept = recipe, not receipt
  cloze('Mum reads the ___ for the cake.', 'recipe', 'receipt'),
  cloze('This ___ needs four eggs.', 'recipe', 'receipt'),
  // semester = holiday, not a school term
  cloze('We go to Spain on ___ in the summer.', 'holiday', 'semester'),
  cloze('We have a long ___ in July.', 'holiday', 'semester'),
];
const FALSE_FRIEND_HOLDOUT: readonly EnSentenceSpec[] = [
  cloze('I read a short ___ in school today.', 'story', 'novel'), // novell = short story
  cloze('She wrote a ___ about her cat.', 'story', 'novel'),
  cloze('Dad wears a ___ and a tie to work.', 'suit', 'costume'), // kostym = suit
  cloze('He bought a new ___ for the party.', 'suit', 'costume'),
  cloze('We eat dinner at the ___.', 'table', 'board'), // bord = table
  cloze('Put the plates on the ___.', 'table', 'board'),
];

// The seam pools, keyed by skill code. Each `question` is the Swedish instruction shown above the
// options (display strings live with the content, like the maths `steps` — no i18n in the generator).
export const EN_SENTENCE_POOLS: Record<string, EnSentencePool> = {
  en_sv_order: {
    question: 'Vilken mening är rätt på engelska?',
    practice: orderSpecs(ORDER_ADVS_PRACTICE, ORDER_CLAUSES_PRACTICE),
    holdout: orderSpecs(ORDER_ADVS_HOLDOUT, ORDER_CLAUSES_HOLDOUT),
  },
  en_do_question: {
    question: 'Vilken fråga är rätt på engelska?',
    practice: questionSpecs(Q_SUBJ_PRACTICE, Q_PRED_PRACTICE),
    holdout: questionSpecs(Q_SUBJ_HOLDOUT, Q_PRED_HOLDOUT),
  },
  en_do_negation: {
    question: 'Vilken mening är rätt på engelska?',
    practice: negationSpecs(N_SUBJ_PRACTICE, N_PRED_PRACTICE),
    holdout: negationSpecs(N_SUBJ_HOLDOUT, N_PRED_HOLDOUT),
  },
  en_continuous: {
    question: 'Vad passar i luckan?',
    practice: aspectSpecs(ASPECT_SUBJ_PRACTICE, ASPECT_VERBS_PRACTICE, ASPECT_CUES),
    holdout: aspectSpecs(ASPECT_SUBJ_HOLDOUT, ASPECT_VERBS_HOLDOUT, ASPECT_CUES),
  },
  en_preposition: { question: 'Vilket ord passar i luckan?', practice: PREP_PRACTICE, holdout: PREP_HOLDOUT },
  en_is_get: { question: 'Vilket ord passar i luckan?', practice: IS_GET_PRACTICE, holdout: IS_GET_HOLDOUT },
  en_make_do: { question: 'Vilket ord passar i luckan?', practice: MAKE_DO_PRACTICE, holdout: MAKE_DO_HOLDOUT },
  en_false_friend: { question: 'Vilket ord passar i luckan?', practice: FALSE_FRIEND_PRACTICE, holdout: FALSE_FRIEND_HOLDOUT },
};

// One generator for every sentence rung: seed-pick a PRACTICE item, seed-shuffle its two options so
// the correct one isn't always in the same place, and hand back everything the Item needs.
// `solution` is the completed sentence — the reveal step, i.e. the teaching after a miss.
export function enSentenceItem(
  r: NounRng,
  code: string,
): { text: string; lang: 'sv' | 'en'; question: string; answer: string; solution: string; options: string[] } {
  const pool = EN_SENTENCE_POOLS[code];
  const spec = r.pick(pool.practice);
  return {
    text: spec.text,
    lang: spec.lang,
    question: pool.question,
    answer: spec.answer,
    solution: spec.text.includes('___') ? spec.text.replace('___', spec.answer) : spec.answer,
    options: shuffle(r, [spec.answer, spec.lure]),
  };
}
