// Layout of the skill DAG (the-map.md §7). PURE and graph-only: positions are
// computed from `skills.ts` alone, never from which nodes a child has reached, so
// a node sits in the same place before and after it is earned. No db, no player.

import { SKILLS } from '@/skills';

export type Pos = { x: number; y: number };

const byCode = new Map(SKILLS.map((s) => [s.code, s]));

// Longest-path depth from a root (a skill with no requires). The tier a node
// sits in: tier-1 arithmetic at the root, linear equations at the leaves.
function computeDepths(): Map<string, number> {
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const d = (code: string): number => {
    const cached = depth.get(code);
    if (cached !== undefined) return cached;
    if (visiting.has(code)) return 0; // cycle guard; the graph is validated acyclic
    visiting.add(code);
    const s = byCode.get(code);
    const val = !s || s.requires.length === 0 ? 0 : 1 + Math.max(...s.requires.map((r) => d(r)));
    visiting.delete(code);
    depth.set(code, val);
    return val;
  };
  for (const s of SKILLS) d(s.code);
  return depth;
}

let _positions: Map<string, Pos> | null = null;

// Stable positions: x = tier (longest-path depth), y = order within the tier,
// grouped by family so each subject clusters (multiplication, negatives,
// fractions each form a lane) — the child learns the shape of the subject, not
// just their path. Deterministic; memoised.
export function positions(): Map<string, Pos> {
  if (_positions) return _positions;
  const depth = computeDepths();
  const tiers = new Map<number, string[]>();
  for (const s of SKILLS) {
    const dp = depth.get(s.code)!;
    if (!tiers.has(dp)) tiers.set(dp, []);
    tiers.get(dp)!.push(s.code);
  }
  const pos = new Map<string, Pos>();
  for (const [dp, codes] of tiers) {
    codes.sort((a, b) => {
      const fa = byCode.get(a)!.family;
      const fb = byCode.get(b)!.family;
      return fa < fb ? -1 : fa > fb ? 1 : a < b ? -1 : a > b ? 1 : 0;
    });
    codes.forEach((code, i) => pos.set(code, { x: dp, y: i }));
  }
  _positions = pos;
  return pos;
}

// Extent of the grid, for the client to size its canvas.
export function extent(): { cols: number; rows: number } {
  let cols = 0;
  let rows = 0;
  for (const { x, y } of positions().values()) {
    cols = Math.max(cols, x + 1);
    rows = Math.max(rows, y + 1);
  }
  return { cols, rows };
}

// Every prerequisite edge, prerequisite -> skill.
export function skillEdges(): { from: string; to: string }[] {
  const edges: { from: string; to: string }[] = [];
  for (const s of SKILLS) for (const r of s.requires) edges.push({ from: r, to: s.code });
  return edges;
}
