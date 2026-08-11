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

// English is offered only to children who already read/write some English — the readers. Below
// this, the mixed Öva stays maths (+Swedish) as before. One number retunes it.
export const ENGLISH_MIN_YEAR = 3;
export function englishReady(schoolYear: number): boolean {
  return schoolYear >= ENGLISH_MIN_YEAR;
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
