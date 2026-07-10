// A small seeded PRNG so a problem can be reproduced from the seed stored in
// attempt.item_json. mulberry32 — fast, deterministic, good enough for picking
// operands. Not for cryptography (see lib/session for that).

export type Rng = {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive both ends
  pick<T>(arr: readonly T[]): T;
  bool(pTrue?: number): boolean;
};

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    bool: (pTrue = 0.5) => next() < pTrue,
  };
}

// A fresh non-deterministic seed for a new item. The seed itself is stored, so
// this is the only place runtime randomness enters generation.
export function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}
