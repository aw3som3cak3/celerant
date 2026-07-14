import type { Locale } from '@/lib/i18n';

// Static reward content (celerant-cat-collection-spec.md §"Cat roster"). Lives in
// CODE, not the ledger — locale-keyed. Ten mega-famous mathematician cats, each
// costing a flat 20 completed sessions. `order` is a default display order, not a
// hard gate — any target can be collected at any time.
//
// Names are LOCKED (only Euclid→Euklides and Archimedes→Arkimedes differ by
// locale); blurbs are translations. `spriteId` is the single indirection point
// for art: today it maps to a placeholder cat (see room UI), and real ToffeeCraft
// sprites drop in behind the same id with no model change.

export type RewardKind = 'cat' | 'family' | 'prop';
export type Target = { kind: RewardKind; id: string };

export type RosterItem = {
  id: string; // locale-independent, e.g. 'pythagoras'
  kind: 'cat' | 'prop';
  spriteId: string; // ToffeeCraft sprite / slot id (placeholder for now)
  cost: number; // completed sessions; cats = 20
  order: number; // default display order
  name: Record<Locale, string>;
  blurb: Record<Locale, string>; // one-line "who/what", shown on tap
  slot?: { x: number; y: number }; // prop only (deferred)
};

export const CAT_COST = 20;

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
];

export const CATS = ROSTER.filter((r) => r.kind === 'cat');
export const ROSTER_BY_ID = new Map(ROSTER.map((r) => [r.id, r]));
