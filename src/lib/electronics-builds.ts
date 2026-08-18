import 'server-only';

// ── The build LADDER — authored, θ-INERT registry (docs/electronics-subject-plan.md §2b;
//    docs/electronics-celerant-boundary.md §1) ────────────────────────────────────────────
//
// This is the composition/application leg of the electronics subject. It sits BESIDE the engine
// and CONSUMES the fluency signal (see electronics.ts). NOTHING here — no type, no datum, no
// function — is ever read by the selector, θ, the fluency gate, or the ledger (A11 boundary). A
// build is "the making of a thing", never a measurement. If you feel pressure to make the engine
// reason about a build, STOP and report.
//
// The registry is pure DATA: adding the 3 V / 5 V / soldering rungs later is a data-only edit here.

// The four voltage/safety tiers, in the order a child climbs them — start where a short can't start
// a fire (Erik's ordering, §2b). `coin` is the FLOOR: always unlocked, no capability required. Each
// higher tier is unlocked by an elec_cap_* capability granted (adult-confirmed) when a child
// completes a build at the tier below.
export const VOLTAGE_TIERS = ['coin', '3v', '5v', 'soldering'] as const;
export type VoltageTier = (typeof VOLTAGE_TIERS)[number];

// Durable capability codes (the flat, θ-inert facts, per (child, capability)). `elec_cap_*` are the
// equipment/safety capabilities; a completed build also grants a `build_<id>_done` fact (built at
// runtime, not enumerated here).
export type CapabilityCode =
  | 'elec_cap_owns_breadboard'
  | 'elec_cap_tier_3v'
  | 'elec_cap_tier_5v'
  | 'elec_cap_soldering';

// The capability that UNLOCKS each tier. `coin` is the floor (null → always unlocked). This is the
// whole ladder-extension mechanism: a 3 V build lists `voltage_tier: '3v'`, and its tier opens only
// once `elec_cap_tier_3v` is owned — which the coin-cell build grants on completion (see `grants`).
const TIER_UNLOCK: Record<VoltageTier, CapabilityCode | null> = {
  coin: null,
  '3v': 'elec_cap_tier_3v',
  '5v': 'elec_cap_tier_5v',
  soldering: 'elec_cap_soldering',
};

// Is a build's voltage tier unlocked for a child, given the capabilities they own? Pure function —
// the readiness detector's third clause (electronics.ts).
export function tierUnlocked(tier: VoltageTier, owned: ReadonlySet<string>): boolean {
  const cap = TIER_UNLOCK[tier];
  return cap == null || owned.has(cap); // coin (floor) is always unlocked
}

// One line of the kit / bill-of-materials the alert carries so Erik can pre-pack without latency.
export type BomLine = { qty: number; part: string };

// One authored build. `skill_prereqs` reference the OTHER agent's 8 electronics skill codes by
// STRING — a FIXED CONTRACT (docs/electronics-subject-plan.md §2). Do NOT redefine those codes here;
// they live in src/skills.ts when that agent's slice lands, and the readiness detector reads their
// fluency `met` through the fluency-signal seam.
export type BuildDef = {
  id: string;
  name: string; // Swedish
  voltage_tier: VoltageTier;
  skill_prereqs: readonly string[]; // fluency-`met` gated (the 8 electronics skills)
  equipment_prereqs: readonly CapabilityCode[]; // owned-equipment capabilities
  grants: readonly CapabilityCode[]; // capabilities granted on adult-confirmed completion (climbs the ladder)
  kit_bom: readonly BomLine[]; // the parts to buy + pre-pack
  instructions: {
    // kid-with-adult-support, step by step (written for a child working beside a grownup)
    kid_adult: readonly string[];
  };
};

// The 8 electronics skill codes the slice-1 build depends on — the FIXED CONTRACT (§2), referenced
// by string. Named here once so the coin build (and tests) share one source of truth.
export const SLICE1_SKILL_PREREQS = [
  'elec_loop',
  'elec_not_consumed',
  'elec_polarity',
  'elec_id_parts',
  'elec_symbol_match',
  'elec_breadboard',
  'elec_resistor_pick',
  'elec_colour_value',
] as const;

// LJUSSLINGAN (light chain) — STEAM's "Grundkittets egen komposit" (grunder E1·E3·E6·E9), ported
// native. The Celerant cut DROPS STEAM's E24 chip (`läsa ett chip` / 4017 sequencer) and its E8
// restart-button: those grunder are NOT built yet, so the composite is authored as the FOUR-LAMP
// CHAIN that all light — not the sequencer. Its four skills are a SUBSET of the 8 (a lighter build
// than the coin rung): closed loop, LED polarity, breadboard topology, and reading the schematic
// symbol.  E1 → elec_loop · E3 → elec_polarity · E6 → elec_breadboard · E9 → elec_symbol_match
export const LJUSSLINGAN_SKILL_PREREQS = [
  'elec_loop',
  'elec_polarity',
  'elec_breadboard',
  'elec_symbol_match',
] as const;

// ── The registry ────────────────────────────────────────────────────────────────────────────
// Slice 1: ONE rung live — light an LED + resistor on a coin cell. The coin tier is the floor, so
// no tier capability gates it; it needs the 8 skills `met` and an owned breadboard. Completing it
// grants `elec_cap_tier_3v`, which is what opens the next (data-only) rung when it is authored.
export const BUILDS: readonly BuildDef[] = [
  {
    id: 'build_light_led_coin',
    name: 'Tänd en lysdiod på ett knappcellsbatteri',
    voltage_tier: 'coin',
    skill_prereqs: SLICE1_SKILL_PREREQS,
    equipment_prereqs: ['elec_cap_owns_breadboard'],
    grants: ['elec_cap_tier_3v'], // clearing the coin rung opens the 3 V tier
    kit_bom: [
      { qty: 1, part: 'röd lysdiod (LED)' },
      { qty: 1, part: '220 Ω motstånd' },
      { qty: 1, part: 'CR2032 knappcell + hållare' },
      { qty: 1, part: 'liten kopplingsplatta (breadboard)' },
      { qty: 2, part: 'kopplingstrådar (jumpers)' },
    ],
    instructions: {
      kid_adult: [
        'Sätt kopplingsplattan framför dig med en vuxen bredvid.',
        'Titta på lysdioden: det långa benet är plus (+), det korta är minus (−).',
        'Tryck ner motståndet så det överbryggar mittspåret på plattan.',
        'Koppla lysdiodens plus-ben till motståndet, i samma rad.',
        'Koppla en tråd från batteriets plus (+) till motståndets andra ände.',
        'Koppla en tråd från batteriets minus (−) till lysdiodens kort-ben (−).',
        'Lysdioden ska lysa. Om inte: vänd på lysdioden — den lyser bara åt ett håll.',
      ],
    },
  },
  // LJUSSLINGAN — the four-lamp light chain (§5). A 3 V build: its tier opens only once the coin rung
  // has granted `elec_cap_tier_3v`, and it needs an owned breadboard. GRANTS NOTHING that climbs the
  // eltrappan: the next tier (5 V) is earned at the bench through the `fem_volt` körkort prov
  // (electronics-korkort.ts), which owns the `elec_cap_tier_5v` grant — a build shouldn't preempt it.
  // ljusslingan witnesses a real competence at the 3 V tier without moving the ladder. Maps cleanly to
  // the existing `tre_volt` körkort (same tier); no new körkort authored.
  {
    id: 'build_ljusslingan',
    name: 'Ljusslingan — en kedja av fyra lampor',
    voltage_tier: '3v',
    skill_prereqs: LJUSSLINGAN_SKILL_PREREQS,
    equipment_prereqs: ['elec_cap_owns_breadboard'],
    grants: [], // a 3 V leaf build — the fem_volt körkort owns the climb to 5 V, not this build
    kit_bom: [
      { qty: 4, part: 'lysdioder (LED) i fyra färger' },
      { qty: 4, part: '220 Ω motstånd' },
      { qty: 1, part: 'batterihållare 2×AA (3 V) + två AA-batterier' },
      { qty: 1, part: 'kopplingsplatta (breadboard)' },
      { qty: 6, part: 'kopplingstrådar (jumpers)' },
    ],
    instructions: {
      kid_adult: [
        'Sätt kopplingsplattan framför dig med en vuxen bredvid.',
        'Dra en tråd från batterihållarens plus (+) till plus-skenan, och från minus (−) till minus-skenan.',
        'Ta första lysdioden: det långa benet är plus (+), det korta är minus (−).',
        'Sätt ett 220 Ω motstånd före varje lysdiod så den inte lyser för hårt.',
        'Koppla motståndet till plus-skenan och lysdiodens plus-ben i samma rad — precis som i kretsschemat.',
        'Koppla lysdiodens kort-ben (−) till minus-skenan.',
        'Gör likadant med alla fyra lamporna, en i taget, i en rad bredvid varandra.',
        'Alla fyra ska lysa. Lyser någon inte? Vänd just den lysdioden — den lyser bara åt ett håll.',
      ],
    },
  },
];

export const BUILDS_BY_ID: ReadonlyMap<string, BuildDef> = new Map(BUILDS.map((b) => [b.id, b]));

// The durable fact a completed build writes, per build id.
export function buildDoneCapability(buildId: string): string {
  return `build_${buildId}_done`;
}
