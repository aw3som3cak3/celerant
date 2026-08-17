# Electronics, Celerant-native — the full graph (ported from STEAM)

Status: SPEC (2026-08-17), for review before build. Supersedes the slice-1 sketch in
`electronics-subject-plan.md` (which stays as the record of what shipped first). Decision: electronics is
built **Celerant-native**; the sibling **STEAM** project (`../steam`) is a field-tested **design source we
mine**, not a separate authority. This doc ports STEAM's electronics graph (E1–E24), its voltage-safety
ladder (*eltrappan*), and its composites into Celerant's own model.

## 0. The one translation that drives everything: STEAM "judge" → Celerant surface
STEAM tags every fundamental with a *domare* (judge). That tag tells us exactly which Celerant surface a
node belongs on:

| STEAM judge | Means | Celerant surface | Graded on |
|---|---|---|---|
| **maskin** | a machine can mark it (colour code, symbol, pinout) | screen **fluency skill** (recognition / typed production) | θ + rate (fluency) |
| **verkligheten** | the build lights or it doesn't | **witnessed build** (build ladder) | adult-confirmed, θ-inert |
| **manniska** | a master's eye (solder joint, quality) | **witnessed build** + a *körkort* prov | adult-confirmed, θ-inert |

STEAM says the maskin nodes are where *"an app does it better than a human every day"* — those are cleanly
ours. The reality/human nodes are the **bench**, and Celerant only witnesses them; it never claims its
`fluent` proves a child can build. This is STEAM's two-threshold rule made native: **screen fluency ≠
bench capability.**

## 1. The fundamentals graph (screen skills)
Ported from STEAM `data/grunder.js` E-nodes, keeping STEAM's tested `requires` edges and its "invisible
academic layer" as `crossRequires`. `subject: 'electronics'`; engine stays subject-blind (like English).

### 1a. Recognition / production — `maskin` → fluency-aimed
| Celerant code | STEAM | skill | surface | requires | crossRequires |
|---|---|---|---|---|---|
| `elec_id_parts` ✓ | E2 | name the parts | ChoiceStage (image) | `elec_loop` | READING_READY |
| `elec_colour_value` ✓ | E5 | resistor colour → value | numpad (**typed**) | `elec_id_parts` | `mult_by_powers_of_ten` |
| `elec_symbol_match` ✓ | E9 | read a schematic symbol | ChoiceStage | `elec_id_parts` | READING_READY |
| `elec_pinout` ✦new | E24 | read a chip: notch, pin 1, counter-clockwise | ChoiceStage | `elec_id_parts` | — |
| `elec_breadboard` ✦new | E6 | which breadboard holes connect | ChoiceStage | `elec_loop` | — |

*The "three readings" family* (STEAM's own grouping): **E3 polarity · E5 colour code · E24 pinout** — *read a
component before you use it.* Author them as a coherent set; all three are the branch's richest app material.

### 1b. Concept / model — accuracy-graded (never sprinted)
| Celerant code | STEAM | skill | surface | requires | crossRequires |
|---|---|---|---|---|---|
| `elec_loop` ✓ | E1 | closed loop — current goes round | ChoiceStage (vs misconceptions) | — | READING_READY |
| `elec_not_consumed` ✓ | (in E1) | current isn't "used up" | ChoiceStage | `elec_loop` | — |
| `elec_polarity` ✓ | E3 | LED has a + leg, lights one way | ChoiceStage / cue-fade | `elec_loop` | — |
| `elec_resistor_pick` ✓ | E7 | size the series resistor (**×50 rule**, §4) | numpad (**typed**) | `elec_id_parts` | **`mult_mixed`** (was division) |
| `elec_series_add` ✓ | (in lampan) | resistors in series add | numpad | `elec_resistor_pick` | `add_2d_carry` |
| `elec_safety` ✦new | E11 | what's safe at which voltage | ChoiceStage | `elec_loop` | READING_READY |
| `elec_continuity` ✦new | E13 | "does it beep?" = a complete path | ChoiceStage | `elec_loop` | — |
| `elec_analog_digital` ✦new | E17 | analog vs digital signal | ChoiceStage | `elec_breadboard` | — |

✓ = already shipped · ✦new = to add. **Not** ported as screen skills (they're bench/witnessed, §3): E12/E14
measuring, E15 debugging, E16 sensor, E18–E23 soldering/permanent, E22 drive-a-load.

## 2. What changes vs. what shipped
- **Keep** all 8 shipped skills; **re-gate** `elec_resistor_pick` to multiplication (§4).
- **Add** 5 concept/recognition skills: `elec_pinout`, `elec_breadboard`, `elec_safety`, `elec_continuity`,
  `elec_analog_digital` — all on the INTRODUCE list so established players meet them.
- **Adopt STEAM's requires edges** (E1 is the root; E2→E5/E9/E24; E6 needs E1; E7 needs E1+mult).
- Recognition skills stay **choice** (exposure/`met`); the two that must gate a bench (`elec_colour_value`,
  `elec_resistor_pick`) stay **typed** production so they can reach `measured` (STEAM: a choice node never
  reaches the bench threshold).

## 3. The voltage-safety ladder (STEAM's *eltrappan*, native)
STEAM orders the ladder **by what can break, not by difficulty** — *"at 3 V nothing dies, at 5 V components
die, at 230 V children die."* Each rung is a **körkort** (licence) earned by a small **prov** (test), and
unlocks builds + equipment. This is our existing build ladder (`elec_cap_*`) enriched with STEAM's licence/
prov structure. All θ-inert, adult-confirmed.

| Rung (körkort) | Earned by prov | Unlocks | our capability |
|---|---|---|---|
| **tre_volt** | light an LED on a coin cell + point out the + leg | 3 V battery builds anywhere, no adult beside | `elec_cap_tier_3v` |
| **fem_volt** | pick the right series resistor from the box | 5 V / USB, breadboard **with resistor** ("components die here") | `elec_cap_tier_5v` |
| **el_och_strom** | safety (E11) | work at the station unsupervised | `elec_cap_el_strom` |
| **lodning** | a clean joint (1:1 adult) — **never timed** | soldering builds | `elec_cap_soldering` |

STEAM insight to adopt: the **Grundkittet** — the one kit that *leaves the room* (coin cell, LEDs, a few
resistor values, a button; nothing hot/sharp/mains). It's the physical twin of the app, and it's what the
`tre_volt` rung hands out. Our build alert's kit BOM should match it.

## 4. The `×50` correction (E7)
STEAM sizes the current-limiting resistor with **multiplication, on purpose**: for a ~20 mA LED,
`R ≈ (Vsupply − Vled) × 50` (because 1 / 0.02 A = 50 Ω per volt). This keeps it reachable for a younger
*Byggare* who can multiply but not yet divide with decimals. So:
- `elec_resistor_pick` poses *"volt över × 50"*, not `(V−Vled)/I`.
- Its `crossRequires` becomes **`mult_mixed`** (+ `sub_within_10` for the drop), **not** `div_mixed`.
- This is the node STEAM calls *"where maths stops being a school subject"* — it should feel like the payoff
  for multiplication, exactly the downstream-gate story.

## 5. Composites → "Bygg en krets" + builds (from STEAM `kompositer.js`)
Port STEAM's authored builds as krets puzzles (screen application) and/or witnessed builds (bench). Each
carries STEAM's requirement vector as its skill gate.

| Build | STEAM grunder | academic | rung | Celerant form |
|---|---|---|---|---|
| **minsta-kompositen** — something that moves & lights | E1, E3 (+mechanics) | — | tre_volt | first witnessed build |
| **lampan-som-lyser-lagom** — the resistor-sizing lamp | E1, E2, E5, **E7** | **multiplication** | fem_volt | krets combine + witnessed build (the flagship) |
| **ljusslingan** — light chain | E1, E3, E6, E9, E24 | — | tre_volt | krets + build |
| **larmet** — an alarm | E1, E4, E6, E8, E9 | — | fem_volt | build |
| **nattlampan** — starts when dark | sensor chain | jamfora_tal | el_och_strom | advanced build |

Our current krets (combine-to-320 Ω · close-the-loop · flip-the-LED) already realises the *lampan* series
step, E1, and E3 — so the composition surface is the right shape; this just gives it a real build catalogue.

## 6. Pedagogy adopted from STEAM
- **Fundamentals are used backwards** — a grund is *what a child gets stuck without*; when stuck, look
  *upstream*. STEAM's electronics stuck-table: nearly every real failure is E6 (breadboard), E7 (no resistor
  → burnt LED), or E13/E21 (broken wire) — *"the code is wrong" is most often a broken lead.* Worth encoding
  as diagnostic hints, not just gates.
- **grund vs komposit** = our fluency vs composition. Fluency can't be produced by repeating the training
  moment; it needs unrehearsed application — which is the "Bygg en krets" / bench build.
- **Never sprint soldering/sawing/sewing** — speed is the wrong *behaviour* at a hot iron. Mark those
  witnessed builds non-sprintable (they're θ-inert anyway).
- **Monotonic skill state** (already Celerant's) and **disclosure: set membership never ordering** (already
  our guardrail) — both are STEAM's inherited invariants; keep them verbatim for electronics.
- **The invisible academic layer** → `crossRequires`. Only E7 (multiplication) is a hard electronics→maths
  gate at this level; adopt it and resist adding more than the graph truly needs.

## 7. Engine impact (A11) & build order
- **Screen skills**: engine-untouched, same as English (subject tag + requires + crossRequires; reuse
  ChoiceStage / numpad / acquisition fade). The 5 new concept skills add no new mechanism.
- **Witnessed builds + körkort/prov**: the existing θ-inert build-ladder subsystem, extended with named
  körkort and a "prov" gate. Still never touches selector/θ/ledger (STOP-and-report if pressure appears).
- **Phased build:**
  1. **Fundamentals graph** — add the 5 skills, re-gate E7 to ×50/multiplication, wire STEAM's requires
     edges, INTRODUCE-list the new ones. (Backbone.)
  2. **Composites** — author the STEAM build catalogue into krets puzzles + the build registry.
  3. **Körkort/prov** — layer STEAM's licence names + prov gates onto the voltage ladder.

## 8. Open questions for review
- **Scope of the screen graph:** ship all 5 new concept skills, or start with the "three readings" family
  (pinout + the existing polarity/colour) and defer safety/continuity/analog-digital?
- **`elec_series_add` vs STEAM:** STEAM has no discrete node (it lives in the lampan build). Keep it a
  Celerant skill (cleaner fluency target) or fold it into the lampan composition? (Spec keeps it.)
- **Körkort naming:** adopt STEAM's Swedish licence names (tre_volt/fem_volt/el_och_strom/lodning) in the
  UI, or Celerant-plain labels? (Lean: STEAM names — they carry the "what breaks" meaning.)
