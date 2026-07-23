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

// A trailing zero is a PATTERNED keystroke: "70" is entered about as fast as "7", so
// it costs a fraction of a fresh digit, not a whole one. Confirmed on prod — a child
// answered mult_table_10 (all "N0") at the SAME rate as a single-digit skill, and the
// only skills whose implied digit output exceeded the child's own tap ceiling were the
// trailing-zero ones (×10, tens). Charging each trailing zero a full digit halved the
// aim for those skills and made the gate a rubber stamp (a child cleared 2.4× the aim
// without it asking a real question). Round shapes beyond trailing zeros (doubles,
// other familiar numbers) are also cheaper, but trailing zeros are the clean, dominant,
// detectable case — modelling the rest is the perfect-ruler chase we're time-boxing out.
const TRAILING_ZERO_COST = 0.25; // a trailing zero costs a quarter-digit of motor time

// Effective MOTOR cost of an answer, in digit-times: full price for each digit except
// trailing zeros, which are discounted. (Signs / slashes are ignored — the tap rate is
// digits/min.) Never below one — every answer takes at least one keystroke-time.
function motorDigitsOf(answer: string): number {
  const ds = answer.replace(/[^0-9]/g, '');
  if (ds.length <= 1) return 1;
  const tz = ds.match(/0+$/)?.[0].length ?? 0;
  return Math.max(1, ds.length - tz + tz * TRAILING_ZERO_COST);
}

// Expected MOTOR cost of a skill's answer, in digit-times, averaged over its OWN
// generator's distribution. This is what the fluency aim budgets motor time for: a
// two-digit answer takes ~two digit-times to enter, not one, so judging it by a one-
// digit aim understates its fluency by the answer-length ratio — an artifact that grows
// up the graph (longer answers) and mimics a transfer signal. Trailing zeros are
// discounted (see motorDigitsOf). Sampled, not hardcoded, so it tracks each generator's
// real mix (add_within_10 ≈ 1.19, mult_table_2 ≈ 1.7, add_2d_no_carry ≈ 2.0, and the
// patterned ×10/tens skills drop well below their raw digit count). DETERMINISTIC (a
// fixed seed sequence) so replay reproduces the seeded rate exactly. Memoized.
const _expectedDigits = new Map<string, number>();
export function expectedAnswerDigits(code: string): number {
  const cached = _expectedDigits.get(code);
  if (cached != null) return cached;
  const N = 400;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += motorDigitsOf(buildItem(code, (0x5eed + i * 0x9e3779b1) >>> 0).answer);
  const avg = sum / N;
  _expectedDigits.set(code, avg);
  return avg;
}

// The sprint auto-submit boundary: the entered answer has reached the server-issued
// digit count, so the tap that completes it can capture and stop the clock. Pure so
// it's unit-testable independent of the DOM.
export function isAnswerComplete(entered: string, answerLength: number): boolean {
  return answerLength > 0 && digitCount(entered) >= answerLength;
}
