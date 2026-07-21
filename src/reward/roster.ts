import type { Locale } from '@/lib/i18n';

// Static reward content (celerant-cat-collection-spec.md §"Cat roster"). Lives in
// CODE, not the ledger — locale-keyed. Ten mega-famous mathematician cats, each
// costing a flat 40 "session-units". `order` is a default display order, not a
// hard gate — any target can be collected at any time.
//
// A session-unit is one 10-item session's worth of work (see repo.ts reward
// counts): a completed session counts ceil(items/10) units, so a 10-item session
// = 1 and the earlier 20-item sessions = 2. Costs doubled from 20→40 alongside
// halving sessions 20→10, leaving the per-item earn-rate unchanged and never
// re-locking a cat that was already earned under the old counting.
//
// Names are LOCKED (only Euclid→Euklides and Archimedes→Arkimedes differ by
// locale); blurbs are translations. `spriteId` names the sprite folder under
// /public/cats/<spriteId>/ (idle/walk/sit/sleep.png, 32×32 frames) — one distinct
// ToffeeCraft cat per mathematician (see src/reward/sprites.ts).

export type RewardKind = 'cat' | 'family' | 'prop';
export type Target = { kind: RewardKind; id: string };

export type RosterItem = {
  id: string; // locale-independent, e.g. 'pythagoras'
  kind: 'cat' | 'prop';
  spriteId: string; // ToffeeCraft sprite / slot id (placeholder for now)
  cost: number; // session-units (one 10-item session = 1 unit); cats = 40
  order: number; // default display order
  name: Record<Locale, string>;
  blurb: Record<Locale, string>; // one-line "who/what", shown on tap
  slot?: { x: number; y: number }; // prop only: fixed % position (center) on the room floor
  size?: number; // prop only: on-screen px (the sprite's rendered height)
};

export const CAT_COST = 40;

export const ROSTER: RosterItem[] = [
  {
    id: 'pythagoras', kind: 'cat', spriteId: 'pythagoras', cost: CAT_COST, order: 1,
    name: { en: 'Pythagoras', sv: 'Pythagoras' },
    blurb: { en: 'the a²+b²=c² triangle rule', sv: 'regeln a²+b²=c² för trianglar' },
  },
  {
    id: 'euclid', kind: 'cat', spriteId: 'euclid', cost: CAT_COST, order: 2,
    name: { en: 'Euclid', sv: 'Euklides' },
    blurb: { en: 'the geometry of the Elements — points, lines, proofs', sv: 'geometrin i Elementa — punkter, linjer, bevis' },
  },
  {
    id: 'archimedes', kind: 'cat', spriteId: 'archimedes', cost: CAT_COST, order: 3,
    name: { en: 'Archimedes', sv: 'Arkimedes' },
    blurb: { en: 'π, circles and spheres, "Eureka!"', sv: 'π, cirklar och klot, "Heureka!"' },
  },
  {
    id: 'fibonacci', kind: 'cat', spriteId: 'fibonacci', cost: CAT_COST, order: 4,
    name: { en: 'Fibonacci', sv: 'Fibonacci' },
    blurb: { en: 'the 1, 1, 2, 3, 5, 8… sequence in nature', sv: 'talföljden 1, 1, 2, 3, 5, 8… i naturen' },
  },
  {
    id: 'alkhwarizmi', kind: 'cat', spriteId: 'alkhwarizmi', cost: CAT_COST, order: 5,
    name: { en: 'al-Khwarizmi', sv: 'al-Khwarizmi' },
    blurb: { en: 'gave us the word algebra — solving for x', sv: 'gav oss ordet algebra — att lösa ut x' },
  },
  {
    id: 'descartes', kind: 'cat', spriteId: 'descartes', cost: CAT_COST, order: 6,
    name: { en: 'Descartes', sv: 'Descartes' },
    blurb: { en: 'the (x, y) coordinate plane', sv: 'koordinatplanet (x, y)' },
  },
  {
    id: 'pascal', kind: 'cat', spriteId: 'pascal', cost: CAT_COST, order: 7,
    name: { en: 'Pascal', sv: 'Pascal' },
    blurb: { en: "Pascal's triangle and the start of probability", sv: 'Pascals triangel och sannolikhetens början' },
  },
  {
    id: 'newton', kind: 'cat', spriteId: 'newton', cost: CAT_COST, order: 8,
    name: { en: 'Newton', sv: 'Newton' },
    blurb: { en: 'gravity and the calculus of change', sv: 'gravitationen och förändringens matematik' },
  },
  {
    id: 'euler', kind: 'cat', spriteId: 'euler', cost: CAT_COST, order: 9,
    name: { en: 'Euler', sv: 'Euler' },
    blurb: { en: 'the Königsberg bridges; the number e', sv: 'broarna i Königsberg; talet e' },
  },
  {
    id: 'gauss', kind: 'cat', spriteId: 'gauss', cost: CAT_COST, order: 10,
    name: { en: 'Gauss', sv: 'Gauss' },
    blurb: { en: 'added 1…100 in seconds as a schoolboy', sv: 'räknade 1…100 på sekunder som skolpojke' },
  },
  // Two themed newcomers (the "pirate" and "masked vigilante" cats), each a real
  // mathematician chosen to fit the costume: Cardano the rogue gambler, Turing the
  // secret code-breaker.
  {
    id: 'cardano', kind: 'cat', spriteId: 'cardano', cost: CAT_COST, order: 11,
    name: { en: 'Cardano', sv: 'Cardano' },
    blurb: { en: 'a daring gambler who cracked the maths of chance', sv: 'en våghalsig spelare som knäckte slumpens matematik' },
  },
  {
    id: 'turing', kind: 'cat', spriteId: 'turing', cost: CAT_COST, order: 12,
    name: { en: 'Turing', sv: 'Turing' },
    blurb: { en: 'cracked secret codes and dreamed up the computer', sv: 'knäckte hemliga koder och drömde fram datorn' },
  },

  // --- Cat furniture (props). Same directed-session model as cats: a completed
  // session (or a redirected sprint bonus) counts toward a prop; at its cost it is
  // placed permanently at its fixed spot on the room floor. Tiered cost — a little
  // toy is not a week's work, a whole cat-tree is. Slots are % of the room stage,
  // center-anchored, kept in the floor band so props sit on the floor.
  {
    id: 'playground', kind: 'prop', spriteId: 'playground', cost: 40, order: 13,
    slot: { x: 83, y: 56 }, size: 104,
    name: { en: 'Cat tree', sv: 'Klätterträd' },
    blurb: { en: 'a tower to climb, perch and hide in', sv: 'ett torn att klättra, sitta och gömma sig i' },
  },
  {
    id: 'bed', kind: 'prop', spriteId: 'bed', cost: 20, order: 14,
    slot: { x: 16, y: 85 }, size: 58,
    name: { en: 'Cat bed', sv: 'Kattbädd' },
    blurb: { en: 'a soft place to curl up and sleep', sv: 'en mjuk plats att rulla ihop sig och sova' },
  },
  {
    id: 'carrier', kind: 'prop', spriteId: 'carrier', cost: 20, order: 15,
    slot: { x: 70, y: 82 }, size: 50,
    name: { en: 'Cat carrier', sv: 'Transportbur' },
    blurb: { en: 'a cosy box to travel in', sv: 'en mysig bur att resa i' },
  },
  {
    id: 'catfood', kind: 'prop', spriteId: 'catfood', cost: 10, order: 16,
    slot: { x: 40, y: 88 }, size: 26,
    name: { en: 'Cat food', sv: 'Kattmat' },
    blurb: { en: 'a full box of crunchy treats', sv: 'en full låda med krispiga godsaker' },
  },
  {
    id: 'fish', kind: 'prop', spriteId: 'fish', cost: 10, order: 17,
    slot: { x: 52, y: 89 }, size: 22,
    name: { en: 'Fish treat', sv: 'Fisk' },
    blurb: { en: 'a tasty fish to nibble on', sv: 'en läcker fisk att mumsa på' },
  },
];

export const CATS = ROSTER.filter((r) => r.kind === 'cat');
export const PROPS = ROSTER.filter((r) => r.kind === 'prop');
export const ROSTER_BY_ID = new Map(ROSTER.map((r) => [r.id, r]));
