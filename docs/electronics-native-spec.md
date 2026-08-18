# Electronics, Celerant-native — the graph (ported from STEAM, sanity-checked)

Status: SPEC v2 (2026-08-17), approved for build. Revised after a sanity check against the electronics-
teaching research (Shipstone misconceptions, PhET, model-before-Ohm's-law, CRA) and Celerant's own lessons
(seeded≠demonstrated, no re-skinned maths skills, accuracy-vs-fluency, A11 boundary, guardrails). Decision:
electronics is built **Celerant-native**; the sibling **STEAM** project (`../steam`) is a field-tested
**design source we mine**, not a separate authority.

## 0. The translation that drives everything: STEAM "judge" → Celerant surface
STEAM tags every fundamental with a *domare* (judge); that tag names the Celerant surface it belongs on.

| STEAM judge | Means | Celerant surface | Graded on |
|---|---|---|---|
| **maskin** | a machine can mark it (colour, symbol, holes) | screen **fluency skill** (recognition / typed production) | θ + rate |
| **verkligheten** | the build lights or it doesn't | **witnessed build** (build ladder) | adult-confirmed, θ-inert |
| **manniska** | a master's eye (solder joint) | **witnessed build** + a *körkort* prov | adult-confirmed, θ-inert |

Screen fluency ≠ bench capability. Celerant witnesses the reality/human nodes; it never claims its `fluent`
proves a child can build.

## 1. The fundamentals graph — the tightened core (8 skills)
The sanity check trimmed the graph to what is research-grounded and near-term. Everything is
`subject: 'electronics'`; the engine stays subject-blind (like English).

### 1a. Recognition / production — `maskin` → fluency-aimed
| Celerant code | STEAM | skill | surface | requires | crossRequires |
|---|---|---|---|---|---|
| `elec_id_parts` ✓ | E2 | name the parts | ChoiceStage (image) | `elec_loop` | — *(pictorial; no reading gate)* |
| `elec_colour_value` ✓ | E5 | resistor colour → value | numpad (**typed**) | `elec_id_parts` | `mult_by_powers_of_ten` |
| `elec_symbol_match` ✓ | E9 | read a schematic symbol | ChoiceStage | `elec_id_parts` | READING_READY |
| `elec_breadboard` ✦new | E6 | which breadboard holes connect | ChoiceStage | `elec_loop` | — |

### 1b. Concept / model — accuracy-graded (never sprinted)
| Celerant code | STEAM | skill | surface | requires | crossRequires |
|---|---|---|---|---|---|
| `elec_loop` ✓ | E1 | closed loop — current goes round | ChoiceStage (vs misconceptions) | — | READING_READY |
| `elec_not_consumed` ✓ | (in E1) | current isn't "used up" | ChoiceStage (vs cookie-monster) | `elec_loop` | READING_READY |
| `elec_polarity` ✓ | E3 | LED has a + leg, lights one way | ChoiceStage / cue-fade | `elec_loop` | — |
| `elec_resistor_pick` ✓ | E7 | size the series resistor (**×50 rule**, §3) | numpad (**typed**) | **`elec_loop`, `elec_id_parts`** | **`mult_mixed`, `sub_within_10`** |

✓ = already shipped · ✦new = to add (one skill: `elec_breadboard`).

**Why these 8 and not more (sanity-check outcomes):**
- **`elec_resistor_pick` is model-gated.** The #1 research finding is *qualitative model before Ohm's law*.
  It now `requires elec_loop` (not just recognition) — you cannot size a resistor before you understand a
  circuit. (Fixes a v1 regression + self-contradiction.)
- **Deferred until a build or an older kid needs them:** `elec_pinout` (E24 — only matters once a build has
  a chip; our builds are LED+resistor), `elec_analog_digital` (E17 — abstract, and STEAM gates it behind a
  sensor), `elec_continuity` (E13 — its screen concept duplicates `elec_loop`; the distinct part is
  bench-measuring/finding-the-break, a later debugging skill), `elec_safety` (E11 — belongs with the körkort
  as priming, §4, not as a standalone screen gate).
- **`elec_series_add` is removed** as a discrete skill — it re-skins addition (graph clutter). Series lives
  *inside* the lampan composition (§5), exactly as STEAM does it.
- **`elec_id_parts` is not reading-gated** — pure picture recognition should be reachable by a pre-reader.
- **`typed` for `colour_value`/`resistor_pick`** is a pedagogical choice (production > recognition for a
  value you must generate), not — as v1 wrongly argued — to satisfy a STEAM bench threshold (STEAM is no
  longer a consumer).

## 2. What changes vs. what shipped
- **Keep** 7 shipped skills; **add** `elec_breadboard`; **remove** `elec_series_add` (fold into §5).
- **Re-gate `elec_resistor_pick`:** add `requires elec_loop`; swap `crossRequires div_mixed → mult_mixed`;
  change the arithmetic from `(V−Vled)/I` to the ×50 rule (§3).
- **Ungate `elec_id_parts`** from READING_READY.
- New skill on the **INTRODUCE list** so established players meet it (the seeded≠demonstrated lesson).
- Recognition stays **choice**; the two produced-value skills stay **typed**.

## 3. The `×50` rule (E7)
For a ~20 mA LED, `R ≈ (Vsupply − Vled) × 50` (1 ÷ 0.02 A = 50 Ω/V). Multiplication, on purpose — reachable
for a younger kid who can multiply but not yet divide with decimals. `elec_resistor_pick` poses *"volt över
× 50"*; keep the numbers clean (small integers → whole-ten resistors). This is STEAM's *"where maths stops
being a school subject"* — the payoff for multiplication, the downstream-gate story made concrete.

## 4. The voltage-safety ladder (STEAM's *eltrappan*, native) — later phase
Ordered **by what can break**: *"3 V nothing dies, 5 V components die, 230 V children die."* Each rung is a
**körkort** earned by a small **prov**; θ-inert, adult-confirmed. This is the existing build-ladder
(`elec_cap_*`) enriched with STEAM's licence/prov structure. **`elec_safety` (E11) lives here as priming for
the `el_och_strom` körkort — never as a screen gate to bench work.**

| Rung (körkort) | Prov | Unlocks | capability |
|---|---|---|---|
| **tre_volt** | light an LED on a coin cell + point out the + leg | 3 V builds, no adult beside | `elec_cap_tier_3v` |
| **fem_volt** | pick the right series resistor from the box | 5 V, breadboard **with resistor** | `elec_cap_tier_5v` |
| **el_och_strom** | safety (E11 priming) | station work unsupervised | `elec_cap_el_strom` |
| **lodning** | a clean joint (1:1) — **never timed** | soldering builds | `elec_cap_soldering` |

Adopt STEAM's **Grundkittet** — the one kit that leaves the room (coin cell, LEDs, a few resistor values, a
button; nothing hot/sharp/mains) — as the `tre_volt` alert's BOM.

## 5. Composites → "Bygg en krets" + builds (from STEAM `kompositer.js`) — later phase
| Build | STEAM grunder | academic | rung | Celerant form |
|---|---|---|---|---|
| **minsta-kompositen** — moves & lights | E1, E3 | — | tre_volt | first witnessed build |
| **lampan-som-lyser-lagom** — right-bright lamp | E1, E2, E5, **E7** | **multiplication** | fem_volt | krets combine (series) + witnessed build (flagship) |
| **ljusslingan** — light chain | E1, E3, E6, E9 | — | tre_volt | krets + build |
| **larmet** — an alarm | E1, E4, E6, E8, E9 | — | fem_volt | build |

The shipped krets (combine-to-320 Ω · close-the-loop · flip-the-LED) already realises the lampan series
step, E1 and E3. **Series addition lives in the combine puzzle** (no standalone skill); gate that puzzle on
`elec_resistor_pick`, not the removed `elec_series_add`.

## 9. Slice 2 — power sources (E4) + switches (E8): unlock *larmet*
The cheap, high-value next slice: two fundamentals that unlock *larmet* (press a button → it sounds/lights)
and a whole family of "turns on when you press it" builds. Both are **verkligheten**-judged in STEAM — so,
exactly like `elec_loop`, the **concept/recognition is screen-taught** and the **doing is a witnessed bench
build**. Two new screen skills:

| Celerant code | STEAM | skill | surface | requires | crossRequires |
|---|---|---|---|---|---|
| `elec_power_source` ✦new | E4 | recognise a source (cell / USB / pack) & that a circuit needs one | ChoiceStage | `elec_loop` | READING_READY |
| `elec_switch` ✦new | E8 | a switch/button opens & closes the loop (which position lights it?) | ChoiceStage | `elec_breadboard` | READING_READY |

Both choice/recognition → fluency-aimed; both on the INTRODUCE list. Placeholder art (source types; a switch
open vs closed) flagged for real art. Then author the **larmet** build (skill_prereqs: `elec_loop`,
`elec_power_source`, `elec_breadboard`, `elec_switch`, `elec_symbol_match`; tier `5v`; kit + kid/adult
instructions), and — if it fits the existing snap-together mechanic — a krets "switch" puzzle (does the lamp
light with the switch open or closed?). This does NOT unlock *nattlampan* (still needs the sensor family — §10).
Engine-untouched; θ-inert builds; same guardrails.

## 10. Slice 3 — *nattlampan*: the "sense and respond" jump
*Nattlampan* — a lamp that turns on when it gets dark — is the build where electronics stops being "light
things up on purpose" and becomes "sense the world and respond." STEAM files it at the top of the branch and
bundles a lot around it (E11 safety, E12/E14 measuring, E16 sensor, E17 analog/digital, E22 drive-a-load,
plus programming). **The sanity-check finding: the BUILD is only two skills away — the rest is enrichment
around it, not a gate on it.**

### 10.1 What the build actually needs (the minimal core)
A basic analog night-light is: a **light sensor (LDR)** whose resistance rises in the dark → a **transistor**
that uses that small change to switch a **LED** on, from a battery. So the genuinely new understanding is:
- **`elec_sensor`** (E16) — a sensor's value tracks the world (darker → the light sensor reads "less light").
- **`elec_transistor`** (E22) — a *small* signal controls a *bigger* current (a transistor as a tap: a light
  touch on the handle lets a lot through). This is the one genuinely hard concept in the branch.

Everything else the build uses already exists (`elec_loop`, `elec_power_source`, `elec_breadboard`,
`elec_symbol_match`). Both new skills are **verkligheten**-judged in STEAM, so — per §0 — the *concept /
recognition is screen-taught* (ChoiceStage) and the *doing is the witnessed bench build*.

| Celerant code | STEAM | skill (screen concept) | surface | requires | crossRequires |
|---|---|---|---|---|---|
| `elec_sensor` ✦new | E16 | a light sensor's value changes with light (dark → less) | ChoiceStage | `elec_breadboard` | READING_READY |
| `elec_transistor` ✦new | E22 | a small signal switches a bigger current (the tap) | ChoiceStage | `elec_sensor` | READING_READY |

### 10.2 The build + the academic gate
**`build_nattlampan`** — `voltage_tier: '5v'`; `skill_prereqs: [elec_loop, elec_power_source, elec_breadboard,
elec_symbol_match, elec_sensor, elec_transistor]`; `equipment_prereqs: [elec_cap_owns_breadboard]`; `grants: []`
(5 V leaf, like larmet). Kit = LDR + NPN transistor + LED + resistor + 5 V source + breadboard; kid+adult
instructions.
**Academic cross-gate:** the sensor *decides* by comparing against a threshold ("is it dark *enough*?"), so
`elec_sensor` (or the build) `crossRequires` a maths **comparison** skill — candidate `more_or_less`. This is
the nattlampan version of the "downstream gate": comparison stops being a worksheet and becomes *why the lamp
knows it's night*.

So slice 3's core is **2 screen skills + 1 build + 1 academic edge** — a tight slice, the same size as E4/E8.

### 10.3 Deferred enrichments (valuable, but NOT gating nattlampan)
STEAM bundles these because they're the "work unsupervised and debug" competence — but the *build* doesn't
require them. Each is its own optional future slice:
- **Measurement family** — `elec_measure_voltage` (E12, voltmeter *across*) and `elec_measure_current` (E14,
  ammeter *in series*). E14 carries a real documented misconception (kids put the ammeter across, like a
  voltmeter) → author it as a ChoiceStage where "across" is the tempting wrong answer, exactly like the loop
  misconceptions. This is the "measure and debug" slice.
- **`elec_analog_digital`** (E17, maskin — cleanly screen-ownable): continuous vs on/off. Useful once a build
  has a digital sensor/microcontroller; a purely analog nattlampa doesn't need it.
- **Safety körkort `el_och_strom`** (E11) — the third eltrappan rung (work station-independent). `elec_safety`
  is its screen priming; the körkort is earned by an adult-approved safety *prov*. **One machinery note:** the
  eltrappan today models tiers as *voltage* (coin/3v/5v/soldering) and körkort as *capabilities granted by a
  build completion*. `el_och_strom` (and `lödning`) are competence körkort earned by a prov **directly**, not
  by finishing a build — so the `/electronics` adult-confirm needs a small new action: "approve körkort prov →
  grant its capability" (today confirm only grants tier caps on build completion). That's the one non-content
  change this whole family needs, and it's small + θ-inert.

### 10.4 Sanity notes (research + Celerant)
- **Age tier.** Sensors and especially transistors are STEAM's *konstruktör/uppfinnare* level. These skills sit
  high (behind fem_volt + comparison), so the youngest never see them — correct, and the graph enforces it.
- **Transistor is the hard one.** Lean on the *tap/valve* analogy (a small turn controls a big flow); keep the
  screen skill to recognition + that one model, and let the bench build carry the wiring (base/collector/emitter
  is a witnessed thing, not a screen thing).
- **Keep the slice honest.** Resist pulling the whole measurement family in "because STEAM lists it" — the
  build needs sensor + transistor; ship those, defer the rest (the graph-trim lesson).
- **Threshold for a körkort on choice skills** — if a future körkort gates on these (concept/choice) skills,
  use the measurability rule already in place (`fluent && met` for choice, not `measured`).

### 10.5 Build order
1. **Core (this slice):** `elec_sensor`, `elec_transistor` (INTRODUCE-listed, placeholder art), + `build_nattlampan`
   + the comparison cross-edge. Unlocks the flagship "responds to dark" build. Small, engine-untouched.
2. **Measurement slice:** `elec_measure_voltage`, `elec_measure_current` (misconception-driven) — the debug
   competence.
3. **Safety/el_och_strom körkort:** `elec_safety` + the prov-grants-capability machinery + the körkort.
4. **`elec_analog_digital`:** whenever a digital/microcontroller build arrives.

### 10.6 Open decisions for review
- **Comparison gate:** `more_or_less` (foundational, reachable) vs a stronger comparison skill — which best
  says "knows dark-enough"? (Lean: `more_or_less`.)
- **Does nattlampan require the safety körkort?** STEAM puts it at el_och_strom; I've scoped it to fem_volt +
  sensor/transistor so it's buildable without first shipping the safety-körkort machinery. Keep it at fem_volt
  (build now) or gate it behind el_och_strom (ship §10.3 safety first)? (Lean: fem_volt now.)
- **Transistor depth:** recognition + the tap analogy only (recommended), or also which-leg-is-which (drifts
  toward pinout, which we deferred)? (Lean: analogy only; legs are a witnessed bench detail.)

## 6. Pedagogy adopted from STEAM
- **Fundamentals used backwards** — a grund is *what a child gets stuck without*. STEAM's electronics
  stuck-table: nearly every failure is E6 (breadboard), E7 (no resistor → burnt LED), or a broken lead —
  *"the code is wrong" is usually a broken wire.* Encode as diagnostic hints later, not gates.
- **grund vs komposit = fluency vs composition** — fluency needs unrehearsed application (the krets / bench
  build), not a repeated training moment.
- **Never sprint soldering** — speed is the wrong behaviour at a hot iron (θ-inert anyway).
- **Monotonic state** and **disclosure: set membership, never ordering** — inherited invariants, kept verbatim.
- **Invisible academic layer → crossRequires** — only E7→multiplication is a hard electronics→maths gate at
  this level; resist adding more than the graph needs.

## 7. Engine impact (A11) & build order
- **Screen skills:** engine-untouched (subject tag + requires + crossRequires; reuse ChoiceStage / numpad /
  acquisition fade). Adding `elec_breadboard` and re-gating `resistor_pick` introduce no new mechanism.
- **Witnessed builds + körkort/prov:** the existing θ-inert build-ladder subsystem; never touches
  selector/θ/ledger (STOP-and-report if pressure appears).
- **Build order:**
  1. **This slice — the fundamentals graph fix** (below). Ships the tightened core.
  2. Composites — author the STEAM build catalogue into krets puzzles + build registry.
  3. Körkort/prov — layer STEAM's licences + prov onto the voltage ladder; add `elec_safety` priming.

## 8. THIS SLICE — the concrete build
1. **`elec_resistor_pick`:** add `requires elec_loop`; `crossRequires` = `mult_mixed` + `sub_within_10` (drop
   `div_mixed`); rewrite its content to the ×50 rule with clean integers.
2. **Add `elec_breadboard`** (E6): ChoiceStage "which holes are connected on this breadboard?" — author a few
   small breadboard images/diagrams with the connected group highlighted vs distractors; `requires elec_loop`;
   fluency-aimed; add to `INTRODUCE_SKILLS`.
3. **Remove `elec_series_add`** as a skill; re-point the krets "combine-to-320 Ω" puzzle's gate to
   `elec_resistor_pick` (or leave it ungated composition); drop its tests/labels.
4. **Ungate `elec_id_parts`** from READING_READY (pictorial recognition reachable by pre-readers).
5. Update the integration/seam test (build prereqs) and all electronics tests; full suite green; `tsc` clean.
