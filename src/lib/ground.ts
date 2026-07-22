// GROUND / acquisition — the SHARED, pure scene contract (GROUND-phase spec §1–2).
// Imported by BOTH the client (which builds an item from a server-issued seed to
// render it) and the server (which re-grades the child's choice from the same seed).
// No repo, no server-only here — the same-seed → same-item guarantee is what lets the
// client render and the server grade without ever trusting the client's idea of the
// answer. The gate/criterion (which reads the ledger) lives in server-only
// ground-gate.ts.
import { makeRng } from './rng';

export type GroundStructure = 'combine' | 'separate';

// The acquisition LADDER for a complete, pre-reading beginner → add within 10. Each
// rung builds on the last (subitize → cardinality → symbol-mapping → symbolic):
//   structure  the MEANING of + / −: things arrive (more) or leave (fewer)
//   count      HOW MANY now — pick the picture-group that shows the total
//   numeral    NAME the amount — pick the digit that matches a group
//   sum        add with pictures — 3🦆 + 4🦆 → pick the digit 7 (bridge to drill)
export type GroundStage = 'structure' | 'count' | 'numeral' | 'sum';

// A run climbs the rungs, two items each (easy → hard). Short, so it never competes
// with drill for session time (spec §4).
export const RUN_STAGES: GroundStage[] = ['structure', 'structure', 'count', 'count', 'numeral', 'numeral', 'sum', 'sum'];
export const GROUND_ITEMS = RUN_STAGES.length;

// The two meanings GROUND teaches, before the add/sub SYMBOL. A family maps to the
// structure a child must be able to recognise: adding IS combining, subtracting IS
// separating. Any family GROUND doesn't cover returns null → "grounded by default"
// (so even a future Level-3 flip could only ever gate add/sub).
export function structureOf(skillCode: string): GroundStructure | null {
  const family = skillCode.split('_')[0];
  return family === 'add' ? 'combine' : family === 'sub' ? 'separate' : null;
}

// Countable objects, reusing the bundled 3D icon assets (/emoji/<kind>.png) so the
// scene looks the same on every device — the same reason the identity icons and UI
// emoji are bundled. Pre-reading-friendly: they're just things to count.
export const OBJECT_KINDS = ['apple', 'fish', 'duck', 'star', 'cookie', 'cherries'] as const;

// ── Rung 1: STRUCTURE ──────────────────────────────────────────────────────
// A concrete situation: `a` objects are present, then `b` objects either arrive
// (combine) or leave (separate). `a`/`b` are small so a young child can subitize;
// combine results stay ≤ 9 and separate always leaves ≥ 1.
export type GroundScene = { kind: string; a: number; b: number; structure: GroundStructure };

export function buildScene(seed: number): GroundScene {
  const r = makeRng(seed);
  const structure: GroundStructure = r.int(0, 1) === 0 ? 'combine' : 'separate';
  const kind = OBJECT_KINDS[r.int(0, OBJECT_KINDS.length - 1)];
  if (structure === 'combine') {
    const a = r.int(2, 5);
    const b = r.int(1, 4);
    return { kind, a, b, structure };
  }
  const a = r.int(3, 6); // start count; b of them leave, a − b remain (≥ 1)
  const b = r.int(1, a - 1);
  return { kind, a, b, structure };
}

export function sceneResult(s: GroundScene): number {
  return s.structure === 'combine' ? s.a + s.b : s.a - s.b;
}

// The symbol shown as a NAME for what the child just did (after the choice).
export function sceneSymbol(s: GroundScene): string {
  return s.structure === 'combine' ? `${s.a} + ${s.b} = ${s.a + s.b}` : `${s.a} − ${s.b} = ${s.a - s.b}`;
}

export function scoreChoice(seed: number, chosen: string): boolean {
  return chosen === buildScene(seed).structure;
}

// ── Rungs 2–4: PICK THE RIGHT AMOUNT ───────────────────────────────────────
// One flexible "choose" item covers count / numeral / sum — they differ only in what
// the prompt shows and whether the four options are picture-groups or numerals.
//   count:   prompt = a + b as two groups (no symbol); options = picture-groups
//   numeral: prompt = one group of `a`;                options = numerals
//   sum:     prompt = a + b with a "+" symbol;         options = numerals
export type ChoicePrompt = { type: 'group'; a: number } | { type: 'sum'; a: number; b: number };
export type ChoiceItem = {
  stage: 'count' | 'numeral' | 'sum';
  kind: string;
  prompt: ChoicePrompt;
  answer: number;
  options: number[]; // 4 distinct values including `answer`, in run order
  optionType: 'group' | 'numeral';
};

// 4 distinct options in [1,10] including the answer, distractors drawn near it.
function makeOptions(r: ReturnType<typeof makeRng>, answer: number, max = 10): number[] {
  const out = [answer];
  const near = [answer - 1, answer + 1, answer - 2, answer + 2, answer + 3, answer - 3].filter((n) => n >= 1 && n <= max);
  // Fisher–Yates over the candidate pool, then take until we have 4.
  for (let i = near.length - 1; i > 0; i--) { const j = r.int(0, i); [near[i], near[j]] = [near[j], near[i]]; }
  for (const n of near) { if (out.length >= 4) break; if (!out.includes(n)) out.push(n); }
  for (let n = 1; out.length < 4 && n <= max; n++) if (!out.includes(n)) out.push(n);
  for (let i = out.length - 1; i > 0; i--) { const j = r.int(0, i); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

function buildChoice(r: ReturnType<typeof makeRng>, stage: 'count' | 'numeral' | 'sum', kind: string): ChoiceItem {
  if (stage === 'numeral') {
    const a = r.int(2, 9);
    return { stage, kind, prompt: { type: 'group', a }, answer: a, options: makeOptions(r, a), optionType: 'numeral' };
  }
  // count / sum: an addition a + b with a result in 2..10, both addends ≥ 1
  const a = r.int(1, 5);
  const b = r.int(1, Math.min(5, 10 - a));
  const answer = a + b;
  return { stage, kind, prompt: { type: 'sum', a, b }, answer, options: makeOptions(r, answer), optionType: stage === 'count' ? 'group' : 'numeral' };
}

export type GroundItem = ({ stage: 'structure' } & GroundScene) | ChoiceItem;

// Build the item for a run position from its seed and stage. Deterministic, so the
// client renders exactly what the server will grade.
export function buildGroundItem(seed: number, stage: GroundStage): GroundItem {
  const r = makeRng(seed);
  const structure: GroundStructure = r.int(0, 1) === 0 ? 'combine' : 'separate';
  const kind = OBJECT_KINDS[r.int(0, OBJECT_KINDS.length - 1)];
  if (stage === 'structure') {
    // Mirror buildScene's draw order so structure items stay stable across callers.
    if (structure === 'combine') { const a = r.int(2, 5); const b = r.int(1, 4); return { stage, kind, a, b, structure }; }
    const a = r.int(3, 6); const b = r.int(1, a - 1); return { stage, kind, a, b, structure };
  }
  return buildChoice(r, stage, kind);
}

// The ledger key a choice records under. Structure items keep their specific meaning
// (combine/separate → feeds the Level-3 gate); the higher rungs record under their
// stage name (never gate anything).
export function conceptKey(item: GroundItem): string {
  return item.stage === 'structure' ? item.structure : item.stage;
}

// Server-side grade from seed + stage. The client sends only its pick (a structure
// name for rung 1, a number for rungs 2–4); the answer is re-derived here.
export function gradeGround(seed: number, stage: GroundStage, chosen: string | number): boolean {
  const item = buildGroundItem(seed, stage);
  if (item.stage === 'structure') return chosen === item.structure;
  return Number(chosen) === item.answer;
}
