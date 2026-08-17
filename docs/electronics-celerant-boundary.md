# Electronics — the celerant ↔ build-webapp boundary (requirements to run against later)

Status: BOUNDARY CONTRACT (2026-08-17). Keep close at hand. When Erik's existing build webapp is
brought alongside, run its behaviour against §3 (the contract) — anything the two systems disagree on
is resolved in favour of the split in §1–2, not by moving logic across the line.

## 0. The principle
celerant teaches and measures **fluency and the mental model** — the *representational* half, which
research (PhET) shows should come first and actually *accelerates* the hands-on half. The build webapp
owns the **physical composition** — the real object, on a real breadboard, in the tech club. The line
between them is: **is it a measurement of a skill, or is it the making of a thing?**

## 1. Inside celerant (the representational / fluency half)
- Component **recognition** fluency (identify LED / resistor / battery / breadboard).
- Schematic **symbol ↔ part** matching.
- The **conceptual model** (complete loop; current not consumed; polarity) — taught against the named
  misconceptions, graded by accuracy.
- **Calculation** fluency that consumes maths: resistor sizing (`R = (V−Vled)/I`), colour-band → value,
  series addition — each cross-gated on the relevant maths skill.
- **The build ladder**: the authored, θ-inert registry of builds and their three prerequisite kinds —
  skill (fluency), equipment-owned (durable capability), and safety tier (voltage/soldering) — plus the
  **readiness detector** and the **grownup alert** it fires (carrying the kit/BOM and kid+adult
  instructions so Erik can pre-pack without latency).
- **Durable capability facts**: flat θ-inert records per `(child, capability)` — `owns_breadboard`,
  `tier_3v`, `tier_5v`, `soldering`, and `build_*_done` — granted on **adult confirmation**. These gate
  later builds (a child who owns a breadboard keeps it, so it stays a prerequisite).
- **Kit descriptions + kid/adult instructions — held here *for now*** (see §2 migration note) so the
  alert is actionable while the two apps are still separate.
- All of it under celerant's guardrails: witness, don't reward; private, not comparative; no points,
  streaks or badges; non-punitive. The build ladder is a *consumer* of the fluency signal that sits
  beside the engine — it never feeds selector/θ/gate/ledger (A11 STOP-and-report if that pressure appears).

## 2. Outside celerant, in the build webapp (the physical / making half)
- The build **instructions**, step photos, bill-of-materials, parts kits.
- **Safety** guidance, tool handling, anything voltage/soldering related.
- The **doing** of the build — the hands-on session at the club.
- **Evidence of the finished build** if richer than a checkbox (photo gallery, mentor sign-off UI,
  shareable "what I made" wall). celerant only needs the *fact* of completion back; the artefacts live
  here.
- Anything social/comparative or reward-shaped (leaderboards, kits earned, club showcases) — these are
  legitimate *there*, and deliberately kept out of celerant so its guardrails stay intact.

**Migration note (the moving line).** Kit descriptions + kid/adult instructions currently live in
celerant so the alert is self-sufficient. They are the **natural migration candidates**: once the build
webapp is integrated, the alert links out to *its* richer instruction/BOM/kit content and celerant keeps
only the readiness detection + the flat capability/completion facts. The safety tiers and physical DOING
always belong here.

## 3. The contract between them (what crosses the line)
Two directions, both minimal. Exact transport (shared read of the fluency signal vs. a small API) TBD;
the *shape* is fixed:

**celerant → build webapp: "who is build-ready."**
Reuse the existing external fluency signal pattern (`GET /api/fluency`, one child + one code →
`{met, fluent, confidence}`; measured-requires-typed). A build is *ready* for a child when every skill
in its prerequisite set reports `met`. The build webapp reads this to unlock a build; it does **not**
read raw θ, and celerant does **not** know what a "kit" or a "club session" is.

**build webapp → celerant: "this build was completed" (adult-confirmed).**
A single witnessed fact: `(child, build_id, completed_at)`, plus any durable capability it grants
(`owns_breadboard`, `tier_3v`, …). celerant records it (the unlock card flips to done, the next tier
opens) and treats it as **θ-inert** — it does not feed the selector, θ, or the ledger. This is the one
write that crosses back, and it carries no score, rank, or reward. Until the webapp is integrated, the
adult confirms completion inside celerant's own build surface.

**What must NOT cross:**
- The engine (selector/θ/gate/ledger) never learns what a build, kit, or club is — build completion is
  a flat fact, never a measurement (A11 boundary; STOP-and-report if this pressure appears).
- No reward/points/comparative data enters celerant from the build side.
- celerant never renders the physical build UX; the build webapp never renders or mutates fluency.

## 4. Why the line sits exactly here
- **Evidence:** screen-first (celerant) → hardware (build webapp) is the sequence PhET data supports;
  the boundary *is* the optimal teaching order, not a compromise.
- **Guardrails:** the comparative/reward energy that a physical club naturally has stays on the build
  side, so celerant's "witness don't reward" stays clean.
- **Engine safety:** the only thing crossing back is a flat completion fact, so the subject-blind
  engine never has to reason about the physical world.
