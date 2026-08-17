# Electronics körkort — the two-phase fluency→bench→diploma flow

Status: SPEC (2026-08-17), for build. Realises spec §4–5 (composites + körkort/prov) as Erik's two-phase
design, reusing Celerant's existing **diploma / shelf** vocabulary and the **electronics_capability** +
adult-confirm machinery already shipped. It is the honest form of STEAM's two-threshold rule: **screen
fluency unlocks the todo; the master's approval at the bench grants the körkort.**

## The three states of a körkort (per child)
```
LOCKED   → not yet fluent in the körkort's prerequisite skill(s)
TODO     → FLUENT on screen (a "congrats you're fluent" diploma) → a pending build at the station
EARNED   → a master approved the physical build → the körkort plaque
```

### Phase 1 — fluency → todo
When the child crosses into **fluency** (earnedFluent / measured — not merely `met`) on a körkort's
prerequisite skills, two things happen:
- a **diploma moment**: *"Du är flytande i färgkoden!"* (reuse the existing done-screen/diploma reveal), and
- the körkort appears as a **TODO** — a pending plaque on the shelf: *"Redo för körkort: 3 volt — bygg det
  vid elektronikstationen"*, carrying the **kit BOM** and **kid+adult instructions** so it can be prepped.

This is the fluency signal (which we built) surfaced as a diploma-that-hands-you-a-physical-next-step.
Crucially it uses **fluency**, not `met`: STEAM's rule is that the couch makes it automatic, the bench uses
it — a `provisional`/`met`-only skill is not enough to send a child to build unsupervised.

### Phase 2 — master approval → körkort
At the station, after the child builds it, a **master** (adult-PIN, the surface we shipped at `/electronics`)
approves. On approval:
- grant the durable `elec_cap_*` capability (existing `grantElectronicsCapability` / `confirmBuildComplete`),
- award the **körkort plaque** — a new, higher class of diploma on the shelf (🎖️ "Körkort: 3 volt"),
  visibly distinct from a fluency diploma (🏅).

The körkort unlocks the next voltage tier (STEAM's *eltrappan*), so EARNED körkort are also prerequisites
for later builds.

## The körkort registry (first two rungs, from STEAM)
Extend the existing build registry (`electronics-builds.ts`) — each körkort:
`{ id, namn, tier, fluencyRequires:[skill codes], prov, kitBOM, instructions }`.

| Körkort | tier | fluencyRequires | prov (what the child shows) | grants |
|---|---|---|---|---|
| **tre_volt** — "3 volt" | coin/3 V | `elec_loop`, `elec_polarity` | light an LED on a coin cell, point out the + leg | `elec_cap_tier_3v` |
| **fem_volt** — "5 volt & kopplingsdäck" | 5 V | `elec_resistor_pick`, `elec_colour_value`, `elec_breadboard` | pick the right resistor from the box, build it on the breadboard | `elec_cap_tier_5v` |

(Later: `el_och_strom` — safety körkort, with `elec_safety` priming; `lödning` — soldering, 1:1, never timed.)
Ordered **by what can break** (3 V nothing dies → 5 V components die), and the **Grundkittet** (coin cell +
LEDs + a few resistors + button — nothing hot/sharp/mains) is the `tre_volt` kit that leaves the room.

## What to reuse vs. build
**Reuse (already shipped):** the diploma reveal + `/shelf` wall + diploma CSS; `electronics_capability` table,
`grantElectronicsCapability`, `confirmBuildComplete`; the `/electronics` adult-PIN approval surface; the
fluency signal (`fluencySignal`/`earnedFluent`) for the phase-1 trigger.

**Build (new):**
1. **Körkort registry** — the table above as data (fluencyRequires + prov + kit + instructions).
2. **State derivation** — per (child, körkort): LOCKED / TODO / EARNED, from fluency + the capability facts.
   Pure, θ-inert; TODO = all `fluencyRequires` are `fluent && measured` AND not yet earned.
3. **Shelf integration** — show electronics körkort in all three states: TODO plaques (pending, with kit +
   instructions) and EARNED körkort plaques (🎖️), alongside the existing fluency diplomas (🏅).
4. **Phase-1 diploma moment** — when a körkort first flips LOCKED→TODO, a "du är flytande → nästa: körkort X"
   reveal (reuse the done-screen diploma path; no bonus, no points).
5. **Phase-2 on approval** — the `/electronics` approve action grants the capability (exists) AND records the
   körkort as EARNED so its plaque appears (new: a körkort-diploma record or a derived plaque from the
   capability fact).

## Guardrails & boundary (unchanged)
- **θ-inert**: the whole körkort layer sits beside the engine — never selector/θ/gate/ledger (A11
  STOP-and-report). Approval is adult-confirmed, carries no score.
- **Witness, don't reward**: a körkort witnesses a real physical competence; **no points/streaks/badges**, no
  per-child comparison. The plaque is private (the child's shelf), never a ranking.
- **Master-in-the-loop is the point**, not latency to avoid: the adult approval is what makes the körkort
  trustworthy (STEAM's *människa*-judge). Phase 1's todo (with kit + instructions) is what removes the
  *latency* — the master arrives already knowing what to check.
- Keep it **test-family gated** until it's proven.

## Open questions for review
- **Where the phase-1 diploma fires:** the practice done-screen (like the burst diploma), the shelf, or both?
  (Lean: a gentle done-screen reveal + a persistent TODO plaque on the shelf.)
- **Körkort vs fluency diploma on the shelf:** one wall with two plaque classes (🏅 fluency, 🎖️ körkort +
  ⏳ todo), or a separate "körkort" section? (Lean: one wall, three visual classes — the progression reads.)
- **Do earned körkort show the child, or only the parent/master?** (Lean: the child sees their own earned
  körkort — it's the payoff — but never anyone else's.)
