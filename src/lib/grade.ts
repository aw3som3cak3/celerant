// Answer grading. Free-text only, never multiple choice (brief §2). Answers are
// integers everywhere until fractions arrive (tier 7), at which point the grader
// accepts "a/b" and compares by value in lowest terms.

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

// Parse into a rational {n, d} in lowest terms, or null if unparseable.
// Accepts "5", "-3", "3/4", "-3/4", " 3 / 4 ".
function parseRational(raw: string): { n: number; d: number } | null {
  const s = raw.trim().replace(/\s+/g, '');
  if (s === '') return null;

  const frac = s.match(/^(-?\d+)\/(-?\d+)$/);
  if (frac) {
    const n = parseInt(frac[1], 10);
    const d = parseInt(frac[2], 10);
    if (d === 0) return null;
    const sign = d < 0 ? -1 : 1;
    const g = gcd(n, d);
    return { n: (sign * n) / g, d: (sign * Math.abs(d)) / g };
  }

  const int = s.match(/^-?\d+$/);
  if (int) return { n: parseInt(s, 10), d: 1 };

  return null;
}

// A spelled word, normalised for comparison: trimmed and lower-cased, so exact-check
// never depends on shift-state — a child who types SOL, Sol or sol all match the stored
// lower-case canonical (A16). Internal spaces are NOT collapsed: a space is a
// särskrivning decision, measured by its own item format, never silently forgiven here.
function normaliseWord(s: string): string {
  return s.trim().toLowerCase();
}

// Grade a typed answer against the skill's canonical answer string. A canonical that
// parses as a rational is graded numerically (maths — unchanged); one that does not is a
// spelled WORD (spelling) and graded by case-insensitive exact match. Real Swedish words
// never parse as rationals, so the branch is unambiguous and maths is untouched.
export function grade(given: string, answer: string): boolean {
  const a = parseRational(answer);
  if (a) {
    const g = parseRational(given);
    return !!g && g.n === a.n && g.d === a.d;
  }
  return normaliseWord(given) === normaliseWord(answer);
}
