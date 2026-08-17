# Electronics — implementation plan (the fourth subject, the first *downstream* one)

Status: PLAN (2026-08-17), for build. Scoped to the fluency + training layers that live **inside
celerant**. The physical-build layer lives in a separate webapp Erik already runs; the contract
between the two is `docs/electronics-celerant-boundary.md` — read that alongside this.

## 0. Why this is the composition leg
Swedish, English and Maths sit side by side as peers. Electronics sits **downstream of all three**:
you cannot size a resistor without division, read a colour band without place-value, total a series
circuit without addition, or follow a build sheet without reading. It is the first subject that
*consumes* the others — so `crossRequires` (the cross-subject gate) finally does real work, and
maths **visibly pays off**. That is also the answer to the "pen-and-paper is more real" pushback:
the payoff here is a real object that lights up, not more symbols on a screen.

## 1. Pedagogical basis (research → design decisions)
The literature on teaching circuits is unusually strong and unusually consistent. Five findings, each
mapped to a concrete build decision.

**(a) Qualitative model *before* quantitative — Ohm's law comes last, not first.**
The misconceptions literature (Shipstone; Driver, *Children's Ideas in Science*; Andersson &
Kärrqvist in Sweden) is emphatic: teaching `V = IR` before a correct mental model of a circuit
produces plug-and-chug with no understanding. → **The first electronics skills are conceptual-model
skills** (current flows in a complete loop; it is *not* used up; it is the same all the way round a
simple series loop), taught in the acquisition/discrimination stage. No calculation skill is eligible
until the model skills are met.

**(b) The documented misconceptions become the distractors (errorless discrimination).**
Shipstone's five recurring wrong models are catalogued and near-universal: *consumption of current*
("used up" by each component — the "cookie-monster" model), *unipolar reasoning* (one wire is enough),
*clashing currents* (current from both terminals meets at the bulb), *sequential/local reasoning* (a
change downstream doesn't affect upstream), and *conflating current, voltage and energy*. → celerant's
ChoiceStage discrimination is the perfect tool: **each misconception is authored as a distractor.**
"Vilken bild visar hur lampan lyser?" with the one-wire model as the tempting wrong answer. We are not
hoping the child avoids the misconception — we are training directly against the named ones.

**(c) Screen-first is the *optimal* sequence, not a compromise (this validates the boundary).**
PhET's Circuit Construction Kit studies: students who learned on the simulation first showed *equal or
better* conceptual understanding **and assembled real circuits faster** than students who started with
hardware — because the representation strips away irrelevant detail (wire colour, lead length) and
makes current flow *visible*. → celerant (the representational/fluency half) genuinely accelerates the
physical build in the other webapp. The split is evidence-backed, not a concession.

**(d) Concrete → Representational → Abstract, in dependency order.**
Recognition of a real part (concrete) → reading its schematic symbol (representational) → computing
with it (abstract). This is also the instructional hierarchy Erik already uses. → the skill graph
below is literally CRA in `requires` edges.

**(e) Fluency applies to the recall-able layer only; the model layer is accuracy.**
Component recognition, symbol↔name, colour-band↔value, and Ohm's-law computation are legitimately
*fluency*-buildable (speed matters, precision-teaching applies). The conceptual model is *not* a rate
measure — "does current get used up?" is comprehension, scored by accuracy, never a stopwatch. → this
maps straight onto celerant's existing accuracy-vs-fluency split: model skills graduate on accuracy;
recognition/calc skills carry a fluency aim. Analogy note for content authors: use the **moving-rope
loop** analogy for the "not consumed" skill (the whole loop moves at once — it directly kills the
"used-up" model); go easy on the water/pressure analogy there, since it quietly reinforces "flows from
one end to the thing."

## 2. First slice — *"Tänd en lysdiod"* (light an LED)
One complete vertical, proving the whole shape (new subject + cross-graph gate + build handoff) before
anything sprawls. ~8 in-app skills + 1 build.

**Model tier (acquisition, accuracy-graded — must come first):**
| code | skill | trains against misconception |
|---|---|---|
| `elec_loop` | current needs a complete loop (two connections, not one) | unipolar / one-wire |
| `elec_not_consumed` | current is the same round a simple series loop; nothing is "used up" | consumption / cookie-monster |
| `elec_polarity` | an LED has a + and − leg; it only lights one way | — (a fact, cue-fade) |

**Recognition tier (fluency-aimed):**
| code | skill | stage |
|---|---|---|
| `elec_id_parts` | identify LED / resistor / battery / breadboard from an image | ChoiceStage (image discrimination) |
| `elec_symbol_match` | match schematic symbol → physical part (3-symbol circuit) | ChoiceStage |

**Calculation tier (fluency-aimed, cross-gated on maths):**
| code | skill | maths it consumes (`crossRequires`) |
|---|---|---|
| `elec_resistor_pick` | pick the current-limiting resistor: `R ≈ (Vbatt − Vled) / I` | subtraction + division |
| `elec_colour_value` | read a resistor's colour bands → value (rule-walk, acquisition fade) | place-value / powers of ten |
| `elec_series_add` | two resistors in series add up | addition |

**Build (the handoff — see boundary doc):**
`build_light_led_coin` — wire the LED + resistor on a **coin cell** so it lights. The first rung of the
build ladder (§2b). Unlocks when the eight skills above are met AND its equipment prerequisites are
owned; adult-confirmed, θ-inert.

## 2b. The build ladder, the alert, and durable capabilities
The build surface is not one card — it is a **ladder of builds**, gated on three kinds of prerequisite:
skill (fluency, from the graph above), **equipment owned** (a durable physical capability the child has
acquired), and **safety tier** (voltage / soldering, climbed one rung at a time so nothing overheats).

**Safety-first voltage ladder** (Erik's ordering — start where a short can't start a fire):
```
coin cell (CR2032, current-limited)  →  2×1.5 V (=3 V)  →  5 V  →  soldered builds
```
Each tier is unlocked by an `elec_cap_*` capability fact granted (adult-confirmed) when the child
completes a build at the tier below. The resistor arithmetic just takes the tier's voltage (3 V, then
5 V — both clean).

**Durable capability facts** — flat, θ-inert, per `(child, capability)`, granted on adult confirmation:
`elec_cap_owns_breadboard`, `elec_cap_tier_3v`, `elec_cap_tier_5v`, `elec_cap_soldering`, and one
`build_*_done` per completed build. Once a child earns `elec_cap_owns_breadboard`, every later build can
list it as a prerequisite — the child keeps the board, so the graph keeps the capability.

**The alert (what Erik gets, and why).** When a child *first* becomes ready for a build — all skill
prerequisites `met`, all owned-equipment prerequisites satisfied, tier unlocked — celerant fires a
**grownup alert** carrying everything needed to act without latency:
- a **kit description / BOM** — the exact parts to buy and pre-pack (e.g. *1× red LED, 1× 220 Ω
  resistor, 1× CR2032 + holder, 1× mini breadboard, 2× jumper*),
- **kid-with-adult-support instructions** — step-by-step, written for a child working beside a grownup,
- the child, the build, and its tier, so Erik can batch-prep kits across the club.

This is the same grownup-alert pattern acquisition already uses as its fallback, aimed at a physical
action instead of a teaching one.

## 3. Graph & gating shape
```
elec_loop ─┐
elec_not_consumed ─┼─→ elec_symbol_match ─→ elec_resistor_pick ─→ build_light_led
elec_polarity ─┘        ↑                        ↑
elec_id_parts ──────────┘         crossRequires: [division, subtraction]
elec_colour_value  (crossRequires: place_value)
elec_series_add    (crossRequires: add_within_20)
```
- `subject: 'electronics'` tag on every skill (engine stays subject-blind — same as English).
- Cross-subject gates via the existing `crossRequires` mechanism (the reading-gate pattern generalised).
- `READING_READY`-style gate on any skill whose items carry Swedish instructions.

## 4. Engine impact (A11 boundary)
**Fluency + training slot in with the engine untouched — exactly like English did.** Reuse:
- ChoiceStage (image discrimination) for recognition + the model-vs-misconception items.
- InputStage numpad for the calculation skills.
- The acquisition fade for `elec_colour_value` (colour-band → value is a rule-walk) and cue-fade for
  `elec_polarity`.
- `crossRequires` for the maths/reading gates.

**The one genuinely new surface is the build handoff** — a build card that unlocks on prerequisites,
shows the parts + schematic, and records a *witnessed completion*. That is not a θ event and must not
touch the selector/θ/ledger. **STOP-and-report** if the build surface ever seems to need the engine to
reason about it — it shouldn't.

## 5. Build order (phased)
1. **Content + graph** — author the 8 skills, symbols, misconception distractors, colour-band walk;
   wire `subject`, `requires`, `crossRequires`. Seed-fluent guard: these are brand-new to *everyone*,
   so put the recognition/model skills on the `INTRODUCE_SKILLS` list (the double/half pattern) so
   established players actually meet them instead of being seeded past.
2. **Fluency + training live** — recognition, model, calculation skills served through the existing
   stages. This is a full, shippable subject on its own, engine-untouched.
3. **Build surface** — the unlock card + witnessed-completion record, and the contract to the external
   build webapp (boundary doc). Decide the witness model first (§6).

## 6. Decisions (settled 2026-08-17)
- **Witness model:** **adult-confirmed.** A grownup is already in the loop (the alert calls them in and
  they support the build), so completion — and the durable capability grants it unlocks (owns breadboard,
  cleared a voltage tier) — is confirmed by the adult, not self-granted by the child. A lit LED is its own
  proof; the adult confirmation is what makes the durable facts trustworthy for later gating.
- **Voltage:** **a safety ladder, not a fixed supply** — coin cell → 2×1.5 V → 5 V → soldering (§2b).
  Start where a short can't start a fire. `elec_resistor_pick` takes the tier's voltage (3 V, then 5 V).
- **Schematic reading:** **3-symbol matching** for slice 1 (reuses ChoiceStage). A full-schematic reader
  is a later, larger surface — deliberately not forked now.

## 7. In-app composition — *"Bygg en krets"* (combine, don't just code)
The recognition + colour skills alone risk teaching electronics as *coding* (recall the band value) rather
than *building*. This rung is the screen-side **composition** for electronics — the mirror of the physical
build, and (per the PhET evidence) the on-screen rehearsal that makes the hardware build faster. It is a
standalone, θ-inert surface like the modelling tier — it *reads* fluency to gate itself but never feeds θ.

**Interaction: snap-together (settled 2026-08-17).** A parts tray (battery, resistors, LED) whose pieces
tap/snap into a single series loop — real combining, no breadboard grid or free wiring (that's a later
rung). The kid sees **real resistor colour bands** on each part, and when two resistors snap together the
bands are visibly two parts of one larger value.

**Rendering: `@wokwi/elements` (MIT web components).** `<wokwi-resistor value>` draws the correct bands
*from the value* — real, data-driven, not hand-painted — plus `<wokwi-led>`, `<wokwi-breadboard>`, battery.
Self-contained SVG, no network (CSP/offline-safe). This also **retires the 14 placeholder SVGs** where a
live part is better. In Next these are client-only (dynamic import, `ssr:false`, register on mount).
*Not* a simulator — we validate topology ourselves (below); we deliberately do **not** pull in a SPICE
sim (Falstad CircuitJS) or a logic-gate sim (CircuitVerse) — wrong tool, and overwhelming for a 6-year-old.

**Validation: rule-based topology, "the scene is the answer key"** (reuse the modelling `validate()` shape,
not a simulation): complete loop (battery + LED present, closed) · LED polarity correct · a current-limiting
resistor present / series sum hits the target. Authored puzzle variants: *combine two resistors to make
320 Ω* (spends `elec_series_add`, bands add up), *complete the loop so the lamp lights* (spends `elec_loop`),
*put the LED the right way* (spends `elec_polarity`).

**Guardrails:** witness, not reward — "✓ kretsen är hel, lampan lyser"; a miss softens and re-serves, no
red X, no points. Gate the surface to the **test family** initially, like the other demos.

### 7.1 ONE interaction across all rungs (difficulty from problems, not from relearning the UI)
**Design rule (settled 2026-08-17):** electronics uses a *single* interaction — **tap a part, it snaps into
the circuit** — from the first LED to the hardest rung. Difficulty scales through the *problems*, never
through a new way to operate the screen. A child never has to relearn the interface to face a harder circuit.
- **Lower rungs:** one series loop — light the LED / combine to a value / fix polarity (shipped).
- **Higher rungs, same gesture:** more components in series, choose or compute values, a second LED, current
  through each — still tap-to-place, still auto-connects.
- **Parallel branches** are the one topology a 1-D series line can't express, so they need a 2-D canvas
  (potentially `<wokwi-breadboard>`). Even there the gesture stays identical — tap parts, they snap in; the
  board is just a bigger canvas. It is a *visual skin over the same interaction*, introduced only when the
  content demands a branch.
- **Never required:** hand-dragging a wire from pin to pin. Pin-accurate manual wiring is exactly the
  "learn a new way to interact" to avoid; keep auto-connect as the always-interaction. (The library's
  `pinInfo` may still be used to draw wires *automatically* — the child never routes them.)
