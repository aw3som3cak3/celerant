// Feature-tagging (instrumentation.md §2). Records, into attempt.item_json, the
// structural quantities of each item — the substrate for a future offline
// feature-difficulty (LLTM) fit. This adds NO live behaviour and reads no θ: it
// is written once and left alone until an analysis reads it months later. The
// fit itself is explicitly out of scope (§6) and must not be built now.
//
// Derived deterministically from the generated (prompt, answer) plus the skill's
// family/code, so it is reproducible from the stored seed (§2.4). A feature is
// stored only when it applies; the rest are omitted.

import { BY_CODE } from '@/skills';

export const FEATURES_VERSION = 1;

export type Operation = 'add' | 'sub' | 'mul' | 'div' | 'linear' | 'fraction' | 'order';

export type ItemFeatures = {
  operands: number[];
  operation: Operation;
  answer_magnitude: number;

  carries?: number;
  crosses_ten?: boolean;
  borrows?: number;
  borrow_across_zero?: boolean;

  operand_max?: number;
  is_tie?: boolean;

  negative_operand?: boolean;
  negative_result?: boolean;
  solution_sign?: 'pos' | 'neg' | 'zero';

  var_both_sides?: boolean;
  has_parentheses?: boolean;
  coefficient?: number;

  like_denominators?: boolean;
  requires_simplification?: boolean;
};

// The problem's operation type, from the skill's family/code — not parsed from
// the glyphs, so a mixed prompt can't mislabel it.
function operationFor(code: string): Operation {
  const s = BY_CODE.get(code);
  const family = s?.family ?? '';
  if (family === 'multiplication') return 'mul';
  if (family === 'division') return 'div';
  if (family === 'order') return 'order';
  if (family === 'fractions') return 'fraction';
  if (family === 'linear') return 'linear';
  if (family === 'negatives') {
    if (code.includes('mult')) return 'mul';
    if (code.includes('div')) return 'div';
    if (code.includes('sub')) return 'sub';
    return 'add';
  }
  if (family === 'sub') return 'sub';
  if (family === 'missing') return code.includes('factor') ? 'div' : 'add';
  return 'add'; // add, bond
}

const num = (raw: string): number => {
  const s = raw.trim();
  const f = s.match(/^(-?\d+)\/(-?\d+)$/);
  if (f) return parseInt(f[1], 10) / parseInt(f[2], 10);
  return parseInt(s, 10);
};

// Every integer literal in the prompt, signed (U+2212 minus normalised).
function operandsOf(prompt: string): number[] {
  const norm = prompt.replace(/−/g, '-');
  return (norm.match(/-?\d+/g) ?? []).map((n) => parseInt(n, 10));
}

function countCarries(a: number, b: number): number {
  let carry = 0;
  let cnt = 0;
  let x = a;
  let y = b;
  while (x > 0 || y > 0) {
    const s = (x % 10) + (y % 10) + carry;
    carry = s >= 10 ? 1 : 0;
    if (carry) cnt++;
    x = Math.floor(x / 10);
    y = Math.floor(y / 10);
  }
  return cnt;
}

function countBorrows(a: number, b: number): { borrows: number; acrossZero: boolean } {
  let borrow = 0;
  let cnt = 0;
  let acrossZero = false;
  let x = a;
  let y = b;
  while (y > 0 || borrow) {
    const digit = x % 10;
    const need = y % 10;
    if (digit - borrow < need) {
      cnt++;
      if (digit === 0) acrossZero = true; // borrowing through a 0 — the canonical bug site
      borrow = 1;
    } else {
      borrow = 0;
    }
    x = Math.floor(x / 10);
    y = Math.floor(y / 10);
  }
  return { borrows: cnt, acrossZero };
}

// From a skill code: derive the operation from its family, then compute.
export function extractFeatures(code: string, prompt: string, answerStr: string): ItemFeatures {
  return computeFeatures(operationFor(code), prompt, answerStr);
}

// From an explicit operation — used by the probe (evidence-and-theses.md §2),
// whose fixed items are not skills and so have no family to read.
export function computeFeatures(operation: Operation, prompt: string, answerStr: string): ItemFeatures {
  const operands = operandsOf(prompt);
  const answer = num(answerStr);

  const f: ItemFeatures = {
    operands,
    operation,
    answer_magnitude: Math.abs(answer),
  };

  const negOperand = operands.some((n) => n < 0);
  if (negOperand) f.negative_operand = true;
  if (answer < 0) f.negative_result = true;

  // additive structure — direct two-operand, non-negative items only
  if ((operation === 'add' || operation === 'sub') && operands.length === 2 && operands.every((n) => n >= 0) && prompt.indexOf('□') === -1) {
    const [a, b] = operands;
    if (operation === 'add') {
      f.carries = countCarries(a, b);
      if (a < 10 && b < 10 && a + b >= 10) f.crosses_ten = true;
    } else {
      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      const { borrows, acrossZero } = countBorrows(hi, lo);
      f.borrows = borrows;
      if (acrossZero) f.borrow_across_zero = true;
    }
  }

  if (operation === 'mul' && operands.length === 2) {
    f.operand_max = Math.max(Math.abs(operands[0]), Math.abs(operands[1]));
    if (operands[0] === operands[1]) f.is_tie = true;
  }

  if (operation === 'linear') {
    f.solution_sign = answer > 0 ? 'pos' : answer < 0 ? 'neg' : 'zero';
    if (prompt.includes('(')) f.has_parentheses = true;
    const sides = prompt.split('=');
    if (sides.length === 2 && sides[0].includes('x') && sides[1].includes('x')) f.var_both_sides = true;
    const m = prompt.match(/(-?\d*)x/);
    if (m) f.coefficient = m[1] === '' || m[1] === '-' ? (m[1] === '-' ? -1 : 1) : parseInt(m[1], 10);
  }

  if (operation === 'fraction') {
    // denominators of the first two fractions, if the prompt is fraction op fraction
    const fr = [...prompt.matchAll(/(\d+)\/(\d+)/g)].map((mm) => parseInt(mm[2], 10));
    if (fr.length >= 2) f.like_denominators = fr[0] === fr[1];
    if (/Förkorta/.test(prompt)) f.requires_simplification = true;
  }

  return f;
}
