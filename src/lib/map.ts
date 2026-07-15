import 'server-only';
import * as repo from '@/db/repo';
import { SKILLS, generateCanon } from '@/skills';
import { skillLabel } from './labels';
import { makeRng, randomSeed } from './rng';
import { positions, skillEdges, extent } from './graph';
import { buildStates } from './practice';
import { computeUnlocked } from './selector';

// The map (the-map.md). This renders data you already have — the card shelf laid
// out AS the graph — and fogs everything the child hasn't earned. It adds no
// data and touches no θ: dropping the `card` table blanks it and changes nothing.

const META = new Map(SKILLS.map((s) => [s.code, s]));

export type Edge = { from: string; to: string };

// ── the three rings (§2) ────────────────────────────────────────────────────
// reached  : has a card (solid, its true position).
// frontier : unlockable right now (the model gate) and not yet reached.
// near     : one graph-step beyond — every prerequisite is reached or frontier.
// Everything else is fog: absent from the child's payload, not merely hidden.
function rings(playerId: string, schoolYear: number): {
  reached: Set<string>;
  frontier: Set<string>;
  near: Set<string>;
} {
  const reached = new Set(repo.cardsForPlayer(playerId).map((c) => c.skillCode));
  const unlocked = computeUnlocked(buildStates(playerId, schoolYear));

  const frontier = new Set<string>();
  for (const s of SKILLS) if ((unlocked.get(s.code) ?? false) && !reached.has(s.code)) frontier.add(s.code);

  const near = new Set<string>();
  for (const s of SKILLS) {
    if (reached.has(s.code) || frontier.has(s.code) || s.requires.length === 0) continue;
    if (s.requires.every((r) => reached.has(r) || frontier.has(r))) near.add(s.code);
  }
  return { reached, frontier, near };
}

// The frontier is exactly the set the session-start chooser draws from
// (motivation §3.2) — unlockable-and-not-yet-reached — from the same
// computeUnlocked gate. Exposed so the two can be asserted to agree.
export function frontierCodes(playerId: string, schoolYear: number): Set<string> {
  return rings(playerId, schoolYear).frontier;
}

// ── child map (§2, §5) ──────────────────────────────────────────────────────
// A reached node carries its card. A frontier node carries only its label (empty
// frame — the child chooses it to go there). A near node carries NO identity: a
// silhouette. No node beyond the near ring appears at all. No count, no percent,
// no distance — the horizon is unmeasurable by construction.
export type ChildNode =
  | {
      id: string;
      x: number;
      y: number;
      state: 'reached';
      family: string;
      label: string;
      prompt: string;
      given: string | null;
      earnedAt: number;
    }
  | { id: string; x: number; y: number; state: 'frontier'; family: string; label: string }
  | { id: string; x: number; y: number; state: 'near' };

export type ChildMap = { nodes: ChildNode[]; edges: Edge[]; cols: number; rows: number };

export function buildChildMap(playerId: string, schoolYear: number): ChildMap {
  const { reached, frontier, near } = rings(playerId, schoolYear);
  const cards = new Map(repo.cardsForPlayer(playerId).map((c) => [c.skillCode, c]));
  const pos = positions();

  // A silhouette's opaque id reveals only its position, never its identity.
  const nearId = (code: string) => `near:${pos.get(code)!.x},${pos.get(code)!.y}`;
  const idOf = (code: string): string | null => {
    if (reached.has(code) || frontier.has(code)) return code;
    if (near.has(code)) return nearId(code);
    return null; // fog: never emitted, in a node or an edge
  };

  const nodes: ChildNode[] = [];
  for (const s of SKILLS) {
    const p = pos.get(s.code)!;
    if (reached.has(s.code)) {
      const c = cards.get(s.code)!;
      nodes.push({
        id: s.code,
        x: p.x,
        y: p.y,
        state: 'reached',
        family: s.family,
        label: skillLabel(s.code),
        prompt: c.prompt,
        given: c.given,
        earnedAt: c.earnedAt,
      });
    } else if (frontier.has(s.code)) {
      nodes.push({ id: s.code, x: p.x, y: p.y, state: 'frontier', family: s.family, label: skillLabel(s.code) });
    } else if (near.has(s.code)) {
      nodes.push({ id: nearId(s.code), x: p.x, y: p.y, state: 'near' });
    }
  }

  const edges: Edge[] = [];
  for (const s of SKILLS) {
    const to = idOf(s.code);
    if (!to) continue;
    for (const r of s.requires) {
      const from = idOf(r);
      if (from) edges.push({ from, to });
    }
  }

  // Canvas sized to the SHOWN nodes only, never the full graph (§5): the child
  // must not be able to infer the total depth or breadth of what remains.
  let cols = 0;
  let rows = 0;
  for (const n of nodes) {
    cols = Math.max(cols, n.x + 1);
    rows = Math.max(rows, n.y + 1);
  }
  return { nodes, edges, cols, rows };
}

// ── card shelf (the child's simplified view) ────────────────────────────────
// The full graph is too much history for a child. Instead: a TROPHY SHELF of the
// skills they've completed, and — separately — one focused strip per skill they're
// working on now, showing only what leads INTO it and a hint of what's just BEYOND.
// Fog still holds: successors are shown as counted silhouettes, never named.
export type ShelfCard = { code: string; label: string; family: string; sample: string };
export type CardShelf = {
  trophies: { code: string; label: string; family: string; prompt: string; given: string | null }[];
  active: { node: ShelfCard; from: ShelfCard[]; coming: number }[];
};

export function buildCardShelf(playerId: string, schoolYear: number): CardShelf {
  const { reached, frontier, near } = rings(playerId, schoolYear);

  // trophies: every completed skill, in the order they were earned, each carrying
  // the actual problem the child solved.
  const trophies = repo.cardsForPlayer(playerId).map((c) => ({
    code: c.skillCode,
    label: skillLabel(c.skillCode),
    family: META.get(c.skillCode)?.family ?? '',
    prompt: c.prompt,
    given: c.given,
  }));

  const asCard = (code: string): ShelfCard => {
    let sample = '';
    try {
      sample = generateCanon(code, makeRng(randomSeed())).prompt;
    } catch {
      /* a skill with no generator sample — the label alone stands in */
    }
    return { code, label: skillLabel(code), family: META.get(code)?.family ?? '', sample };
  };

  // active: one focus strip per frontier skill — the reached prerequisites that
  // lead into it, the skill itself (tappable to practise), and a count of the
  // silhouettes just beyond (the "coming" nodes, kept fogged: no identity).
  const active = [...frontier].map((f) => {
    const meta = META.get(f)!;
    const from = meta.requires.filter((r) => reached.has(r)).map(asCard);
    const coming = SKILLS.filter((s) => s.requires.includes(f) && near.has(s.code)).length;
    return { node: asCard(f), from, coming };
  });

  return { trophies, active };
}

// ── parent map (§6) ─────────────────────────────────────────────────────────
// The full graph, unfogged: every node in its true position, all edges, θ in
// context. The instrument, not a report card.
export type ParentNode = {
  code: string;
  x: number;
  y: number;
  family: string;
  year: number;
  theta: number;
  state: 'reached' | 'frontier' | 'locked';
  label: string;
};
export type ParentMap = { nodes: ParentNode[]; edges: Edge[]; cols: number; rows: number };

export function buildParentMap(playerId: string): ParentMap {
  const player = repo.playerById(playerId);
  if (!player) return { nodes: [], edges: [], cols: 0, rows: 0 };
  const { reached, frontier } = rings(playerId, player.school_year);
  const ability = repo.abilities(playerId);
  const pos = positions();

  const nodes: ParentNode[] = SKILLS.map((s) => {
    const p = pos.get(s.code)!;
    const state: ParentNode['state'] = reached.has(s.code) ? 'reached' : frontier.has(s.code) ? 'frontier' : 'locked';
    return {
      code: s.code,
      x: p.x,
      y: p.y,
      family: s.family,
      year: META.get(s.code)!.year,
      theta: ability.get(s.code)?.theta ?? 0,
      state,
      label: skillLabel(s.code),
    };
  });
  const { cols, rows } = extent();
  return { nodes, edges: skillEdges(), cols, rows };
}
