// The vet-surface clip lists, shared by the review pages AND the granska hub so their
// "X kvar" counts are computed from ONE source. Pure (built from the content banks the
// children actually hear/see); no data, no player state. Test-family surfaces only.

import { RECOG_WORDS, TRANSPARENT_WORDS, SPELLING_POOLS } from './spelling-content';
import { EN_VERBS, EN_COLORS, EN_NOUNS, EN_ATTRS } from './english-content';

// ── Audio (Sofie spelling clips) ────────────────────────────────────────────
export type AudioTier = 'recog' | 't2' | 't3';
export type AudioClip = { tier: AudioTier; code: string; word: string };

export const AUDIO_CLIPS: AudioClip[] = (() => {
  const recog = Array.from(new Set([...RECOG_WORDS.map((w) => w.word), ...TRANSPARENT_WORDS.map((w) => w.word)]));
  const t2 = [...SPELLING_POOLS.spelling_t2.practice, ...SPELLING_POOLS.spelling_t2.holdout];
  const t3 = [...SPELLING_POOLS.spelling_t3.practice, ...SPELLING_POOLS.spelling_t3.holdout];
  return [
    ...recog.map((word) => ({ tier: 'recog' as const, code: 'spelling_t0', word })),
    ...t2.map((word) => ({ tier: 't2' as const, code: 'spelling_t2', word })),
    ...t3.map((word) => ({ tier: 't3' as const, code: 'spelling_t3', word })),
  ];
})();

export const audioKey = (c: { tier: string; word: string }) => `${c.tier}:${c.word}`;

// ── Pictures (English on-ramp renders) ──────────────────────────────────────
export type ImageKind = 'picto' | 'swatch' | 'noun' | 'sizednoun' | 'nounverb';
export type ImageClip = { kind: ImageKind; word: string; picto?: string; color?: string; emoji?: string; big?: boolean; noun?: string; verb?: string };

export const IMAGE_CLIPS: ImageClip[] = [
  ...EN_VERBS.map((v): ImageClip => ({ kind: 'picto', word: v.word, picto: v.picto })),
  ...EN_ATTRS.map((a): ImageClip => ({ kind: 'picto', word: a.word, picto: a.picto })),
  ...EN_COLORS.map((c): ImageClip => ({ kind: 'swatch', word: c.word, color: c.color })),
  ...EN_NOUNS.map((n): ImageClip => ({ kind: 'noun', word: n.word, emoji: n.emoji })),
  // Composite-render SAMPLES — the layouts a child actually taps, so the size scaling and the
  // agent+action pairing get vetted, not just the parts.
  { kind: 'sizednoun', word: 'big cat', emoji: 'cat', big: true },
  { kind: 'sizednoun', word: 'small cat', emoji: 'cat', big: false },
  { kind: 'sizednoun', word: 'big house', emoji: 'house', big: true },
  { kind: 'sizednoun', word: 'small house', emoji: 'house', big: false },
  { kind: 'nounverb', word: 'the dog is running', noun: 'dog', verb: 'run' },
  { kind: 'nounverb', word: 'the cat is sleeping', noun: 'cat', verb: 'sleep' },
  { kind: 'nounverb', word: 'the bird is eating', noun: 'bird', verb: 'eat' },
];

export const imageKey = (c: { kind: string; word: string }) => `${c.kind}:${c.word}`;
