// GROUND / acquisition — the SHARED, pure scene contract (GROUND-phase spec §1–2).
// Imported by BOTH the client (which builds a scene from a server-issued seed to
// animate it) and the server (which re-grades the child's choice from the same
// seed). No repo, no server-only here — the same-seed → same-scene guarantee is what
// lets the client render and the server grade without ever trusting the client's
// idea of the answer. The gate/criterion (which reads the ledger) lives in the
// server-only ground-gate.ts.
import { makeRng } from './rng';

export type GroundStructure = 'combine' | 'separate';

// Scenes per GROUND run — short, since it's a quiet optional door that must never
// compete with drill for session time (spec §4).
export const GROUND_ITEMS = 8;

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

// The count the scene resolves to, for the "count up / name the symbol" beat.
export function sceneResult(s: GroundScene): number {
  return s.structure === 'combine' ? s.a + s.b : s.a - s.b;
}

// The symbol shown as a NAME for what the child just did (after the choice).
export function sceneSymbol(s: GroundScene): string {
  return s.structure === 'combine' ? `${s.a} + ${s.b} = ${s.a + s.b}` : `${s.a} − ${s.b} = ${s.a - s.b}`;
}

// Server-side grade: re-derive the correct structure from the seed and compare. The
// client never sends (and never knows the server's idea of) the right answer.
export function scoreChoice(seed: number, chosen: string): boolean {
  return chosen === buildScene(seed).structure;
}
