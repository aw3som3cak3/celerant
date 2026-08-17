// ── The KÖRKORT registry + PURE state derivation (docs/electronics-korkort-flow.md) ─────────────
//
// A körkort is the two-phase, honest form of STEAM's two-threshold rule: SCREEN FLUENCY unlocks a
// TODO (a pending build at the station), and a MASTER's adult-confirmed approval at the bench GRANTS
// the körkort. This file is the AUTHORED DATA (the two rungs) + the PURE, θ-INERT derivation of a
// körkort's state for one child.
//
// θ-INERT BY CONSTRUCTION: nothing here imports the selector, θ, the fluency gate, or the ledger.
// The derivation takes its fluency + capability facts as PLAIN ARGUMENTS (a lookup fn + an owned set)
// — the caller wires the real sources (electronics.ts). A körkort witnesses a real physical
// competence; it is never a measurement and never feeds the engine. If you feel pressure to make the
// engine reason about a körkort, STOP and report (A11 boundary).
//
// NO server-only import on purpose: this module is pure data + pure functions, so the state-derivation
// tests can import it directly without the DB/server harness.

import type { CapabilityCode, VoltageTier } from './electronics-builds';

// One kit/BOM line — the parts a master pre-packs so the bench has no latency (mirrors BuildDef).
export type BomLine = { qty: number; part: string };

// One authored körkort. `fluencyRequires` reference the OTHER agent's electronics skill codes by
// STRING — the same FIXED CONTRACT the build ladder uses (docs/electronics-native-spec.md §4–5). Do
// NOT redefine those codes here; they live in src/skills.ts.
export type KorkortDef = {
  id: string;
  namn: string; // Swedish display name (e.g. "3 volt")
  tier: VoltageTier; // the voltage tier this körkort certifies (matches the capability it grants)
  fluencyRequires: readonly string[]; // ALL must be fluent && measured before the körkort is a TODO
  grants: CapabilityCode; // the durable capability granted on master approval (climbs the eltrappan)
  prov: string; // what the child physically shows the master ("the test")
  kitBom: readonly BomLine[]; // the Grundkittet etc. — pre-packed for the bench
  instructions: {
    kid: readonly string[]; // written for the child
    adult: readonly string[]; // what the master checks before approving
  };
};

// ── The registry — the first two rungs of the eltrappan, ORDERED BY WHAT CAN BREAK ──────────────
// tre_volt: nothing hot/sharp/mains, and on a coin cell nothing dies — its kit is the "Grundkittet"
// that leaves the room. fem_volt: 5 V + a breadboard, where a wrong resistor kills a component, so it
// certifies the resistor/colour-code/breadboard skills. Adding later rungs (el_och_ström safety,
// lödning soldering) is a DATA-ONLY edit here.
export const KORKORT: readonly KorkortDef[] = [
  {
    id: 'tre_volt',
    namn: '3 volt',
    tier: '3v',
    fluencyRequires: ['elec_loop', 'elec_polarity'],
    grants: 'elec_cap_tier_3v',
    prov: 'Tänd en lysdiod på ett knappcellsbatteri och peka på plusbenet.',
    kitBom: [
      // The Grundkittet — coin cell + LEDs + a few resistors + a button. Nothing hot/sharp/mains.
      { qty: 1, part: 'CR2032 knappcell + hållare' },
      { qty: 3, part: 'lysdioder (LED), olika färger' },
      { qty: 3, part: '220 Ω motstånd' },
      { qty: 1, part: 'tryckknapp' },
      { qty: 4, part: 'kopplingstrådar (jumpers)' },
    ],
    instructions: {
      kid: [
        'Titta på lysdioden: det långa benet är plus (+), det korta är minus (−).',
        'Håll lysdiodens plus-ben mot batteriets plus-sida (+).',
        'Håll det korta benet mot batteriets minus-sida (−).',
        'Lysdioden ska lysa. Lyser den inte? Vänd på den — den lyser bara åt ett håll.',
        'Visa en vuxen: peka på plusbenet och säg varför den lyser.',
      ],
      adult: [
        'Barnet tänder lysdioden på en knappcell utan hjälp.',
        'Barnet pekar ut plusbenet (det långa) och minusbenet.',
        'Barnet kan säga att strömmen går runt i en slinga (loop).',
        'Godkänn körkortet när allt tre stämmer.',
      ],
    },
  },
  {
    id: 'fem_volt',
    namn: '5 volt & kopplingsdäck',
    tier: '5v',
    fluencyRequires: ['elec_resistor_pick', 'elec_colour_value', 'elec_breadboard'],
    grants: 'elec_cap_tier_5v',
    prov: 'Välj rätt förmotstånd ur lådan och bygg lysdioden på kopplingsdäcket.',
    kitBom: [
      { qty: 1, part: 'kopplingsdäck (breadboard)' },
      { qty: 1, part: '5 V-källa (USB-batteri eller nätadapter med skydd)' },
      { qty: 5, part: 'motstånd i sortiment (220 Ω – 1 kΩ)' },
      { qty: 3, part: 'lysdioder (LED)' },
      { qty: 6, part: 'kopplingstrådar (jumpers)' },
    ],
    instructions: {
      kid: [
        'Läs färgkoden på motstånden och välj ett som passar för 5 volt.',
        'Sätt motståndet över mittspåret på kopplingsdäcket.',
        'Koppla lysdiodens plus-ben till motståndet i samma rad.',
        'Dra trådar från 5 V (+) och till minus (−) så slingan blir hel.',
        'Visa en vuxen: berätta varför just det motståndet, och vad färgerna betyder.',
      ],
      adult: [
        'Barnet väljer ett rimligt förmotstånd och kan läsa färgkoden.',
        'Barnet bygger kretsen på kopplingsdäcket, rätt rader och mittspår.',
        'Kretsen fungerar och ingen komponent blir för varm.',
        'Godkänn körkortet när barnet klarar valet + bygget självständigt.',
      ],
    },
  },
];

export const KORKORT_BY_ID: ReadonlyMap<string, KorkortDef> = new Map(KORKORT.map((k) => [k.id, k]));

// ── The three states — PURE, θ-INERT ────────────────────────────────────────────────────────────
//   LOCKED → not (yet) fluent in every prerequisite skill
//   TODO   → fluent && measured on ALL fluencyRequires, but the capability isn't granted yet
//   EARNED → the master approved the build (the capability fact exists)
export type KorkortState = 'locked' | 'todo' | 'earned';

// The fluency facts the derivation needs, as PLAIN DATA (never the FluencySignal type — that lives
// behind the engine). `measured` is `confidence === 'measured'`: the couch made it AUTOMATIC, so the
// bench may use it unsupervised. Merely `met`/`provisional` is deliberately NOT enough.
export type KorkortFluency = { fluent: boolean; measured: boolean };
export type FluencyOf = (code: string) => KorkortFluency;

// Derive one körkort's state from the child's fluency facts + owned capabilities. Pure: same inputs →
// same output, no I/O, no engine. EARNED wins (a granted capability is durable, even if fluency data
// later shifts); otherwise TODO iff every requirement is fluent && measured; else LOCKED.
export function korkortState(korkort: KorkortDef, fluencyOf: FluencyOf, owned: ReadonlySet<string>): KorkortState {
  if (owned.has(korkort.grants)) return 'earned';
  const allReady = korkort.fluencyRequires.every((code) => {
    const f = fluencyOf(code);
    return f.fluent && f.measured;
  });
  return allReady ? 'todo' : 'locked';
}

// Every körkort a child has NOT yet earned but is now READY to build (state === 'todo'). The bench +
// shelf render these; the phase-1 reveal witnesses the flip into this set.
export function todoKorkort(fluencyOf: FluencyOf, owned: ReadonlySet<string>): KorkortDef[] {
  return KORKORT.filter((k) => korkortState(k, fluencyOf, owned) === 'todo');
}
