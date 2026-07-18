import { generateCanon, type CanonItem } from '@/skills';
import { makeRng } from './rng';
import { grade } from './grade';

// The ONE shared item builder (input-timing guardrail 2a). Client and server MUST
// produce an item by calling THIS — same generateCanon, same RNG, one module — so
// the child sees exactly the item the server later grades. If these ever diverged
// by a single value the server would grade a different problem than the one on
// screen. Deterministic from (code, seed); the seed is always server-issued
// (guardrail 2b) so a client can't fish for easy items.
export function buildItem(code: string, seed: number): CanonItem {
  return generateCanon(code, makeRng(seed));
}

// Digit count of the canonical answer — the ONLY thing the server tells the client
// about the answer, so a sprint can auto-submit the instant the last expected digit
// is tapped. A negligible leak ("56 is two digits" tells a cheater nothing) and
// grading still happens server-side.
export function answerLengthOf(code: string, seed: number): number {
  return buildItem(code, seed).answer.replace(/[^0-9]/g, '').length;
}

// Server-side authoritative grading: re-generate the item from its seed and grade
// the child's answer against it. The client never supplies the answer key.
export function gradeBySeed(code: string, seed: number, given: string): { correct: boolean; answer: string; steps: string[] } {
  const item: CanonItem = buildItem(code, seed);
  return { correct: grade(given, item.answer), answer: item.answer, steps: item.steps };
}

export function digitCount(s: string): number {
  return (s.match(/[0-9]/g) ?? []).length;
}

// The sprint auto-submit boundary: the entered answer has reached the server-issued
// digit count, so the tap that completes it can capture and stop the clock. Pure so
// it's unit-testable independent of the DOM.
export function isAnswerComplete(entered: string, answerLength: number): boolean {
  return answerLength > 0 && digitCount(entered) >= answerLength;
}
