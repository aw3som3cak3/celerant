// The probe (evidence-and-theses.md §2): fixed, hand-authored instruments that
// NEVER count toward θ and never adapt. A clean ruler for measuring transfer. The
// items are constant strings with known answers — a changed item is a NEW version
// (bump PROBE_VERSION) and breaks comparability with the old, so do not edit an
// existing item's prompt or answer; add a new set instead.

import { grade } from './grade';
import { computeFeatures, type ItemFeatures, type Operation } from './features';

export const PROBE_VERSION = 1;

export type ProbeItem = { ref: string; prompt: string; answer: string; operation: Operation };

// arith_v1 — components across the tiers: carry, borrow (incl. across zero), the
// harder multiplication facts (the middle of the tables, where the problem-size
// effect bites), a couple of divisions, with easy contrasts. Minus is U+2212.
const arith_v1: ProbeItem[] = [
  { ref: 'a01', prompt: '34 + 25 =', answer: '59', operation: 'add' },
  { ref: 'a02', prompt: '47 + 28 =', answer: '75', operation: 'add' },
  { ref: 'a03', prompt: '38 + 47 =', answer: '85', operation: 'add' },
  { ref: 'a04', prompt: '56 + 27 =', answer: '83', operation: 'add' },
  { ref: 'a05', prompt: '68 − 34 =', answer: '34', operation: 'sub' },
  { ref: 'a06', prompt: '52 − 27 =', answer: '25', operation: 'sub' },
  { ref: 'a07', prompt: '63 − 48 =', answer: '15', operation: 'sub' },
  { ref: 'a08', prompt: '402 − 15 =', answer: '387', operation: 'sub' }, // borrow across zero
  { ref: 'a09', prompt: '7 × 2 =', answer: '14', operation: 'mul' },
  { ref: 'a10', prompt: '5 × 4 =', answer: '20', operation: 'mul' },
  { ref: 'a11', prompt: '7 × 8 =', answer: '56', operation: 'mul' },
  { ref: 'a12', prompt: '6 × 7 =', answer: '42', operation: 'mul' },
  { ref: 'a13', prompt: '8 × 6 =', answer: '48', operation: 'mul' },
  { ref: 'a14', prompt: '9 × 7 =', answer: '63', operation: 'mul' },
  { ref: 'a15', prompt: '8 × 7 =', answer: '56', operation: 'mul' },
  { ref: 'a16', prompt: '7 × 7 =', answer: '49', operation: 'mul' }, // tie
  { ref: 'a17', prompt: '56 / 8 =', answer: '7', operation: 'div' },
  { ref: 'a18', prompt: '63 / 9 =', answer: '7', operation: 'div' },
  { ref: 'a19', prompt: '48 / 6 =', answer: '8', operation: 'div' },
];

// transfer_v1 — COMPOUND items whose solution needs the drilled components but
// which are themselves never practised in this exact form. This is the set that
// catches transfer: fluency in the parts showing up in the whole.
const transfer_v1: ProbeItem[] = [
  { ref: 't01', prompt: '3 + 4 × 2 =', answer: '11', operation: 'order' },
  { ref: 't02', prompt: '20 − 3 × 5 =', answer: '5', operation: 'order' },
  { ref: 't03', prompt: '(8 + 5) × 2 =', answer: '26', operation: 'order' },
  { ref: 't04', prompt: '6 × 3 + 4 =', answer: '22', operation: 'order' },
  { ref: 't05', prompt: '2 × (7 + 1) =', answer: '16', operation: 'order' },
  { ref: 't06', prompt: '3x + 7 = 22', answer: '5', operation: 'linear' },
  { ref: 't07', prompt: 'x − 8 = 15', answer: '23', operation: 'linear' },
  { ref: 't08', prompt: '4x = 20', answer: '5', operation: 'linear' },
  { ref: 't09', prompt: '2x + 3 = 11', answer: '4', operation: 'linear' },
  { ref: 't10', prompt: 'x / 3 = 6', answer: '18', operation: 'linear' },
];

export const PROBE_SETS: Record<string, ProbeItem[]> = { arith_v1, transfer_v1 };

export function probeSet(set: string): ProbeItem[] {
  return PROBE_SETS[set] ?? [];
}

// Items for administration — refs and prompts only, never the answers (which the
// client must not see, exactly as with practice items).
export function probeItemsForClient(set: string): { ref: string; prompt: string }[] {
  return probeSet(set).map((i) => ({ ref: i.ref, prompt: i.prompt }));
}

// Grade one probe response against the fixed item, and tag it with the same
// feature schema as instrumentation §2. Returns null for an unknown ref.
export function gradeProbe(
  set: string,
  ref: string,
  given: string | null,
): { correct: number; features: ItemFeatures } | null {
  const item = probeSet(set).find((i) => i.ref === ref);
  if (!item) return null;
  const correct = given != null && grade(given, item.answer) ? 1 : 0;
  const features = computeFeatures(item.operation, item.prompt, item.answer);
  return { correct, features };
}
