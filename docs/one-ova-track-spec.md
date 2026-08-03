# One "Öva" track — implementation spec (final)

Status: decisions locked. Build in staged order; each stage on-device-gated on the youngest's
flow. Engine (selector, θ, gate, ledger semantics, reward-per-session) is reused, not rebuilt.

## Why this is right (the case, so it's built with intent)
This is one-thing-on-screen taken to its end, and it fixes the bottleneck the data kept
showing: **sprint uptake was the constraint** — 22 sprints against 134 sessions, mostly one
kid — so the fluency layer starved for measurements while the kids generated thousands of
timed practice intervals nobody read. **Passive measurement turns every practising child into
a fluency data source automatically.** The transfer experiment (T1) stops being starved; the
"which skill to sprint" tie-breaker targeting becomes moot; and the stopwatch — the most
test-like object in the app — disappears. It is the purest form of *witness, don't reward*.

## The shape (decided)
- **One child-facing action per child: Öva.** No Utforska door, no speed-run door.
- The graph's floor **extends down** to include the Fler/Färre acquisition as real bottom rungs.
- **Moving a child down is just the selector** doing its job — a young kid, or an over-placed
  older kid who can't hold it, drops to the floor and climbs the symbols until fluent.
- **Speed measurement is invisible**, woven into ordinary practice, paying the same **1 point**
  as any session, with a **diploma** as the quiet payoff for crossing.

---

## Workstream I — Home collapses to one Öva
**Now:** tapping a tile branches on `groundFirst` → `/ground`, else opens `SprintChoiceModal`
(Öva / En omgång / Utforska / Diplomas), else `/practice` (`src/app/page.tsx`).
**Change:** tapping a tile goes **straight to `/practice`** for every child. Delete the modal
and its doors. GROUND rungs render *inside* `/practice` (WS II); speed is measured *inside* it
(WS III). Diplomas stay reachable from the practice done-screen (the 🏅 button already there) —
a private record, not a door.
**Engine:** none. Some per-player routing flags (`canSprint`, `needsToolTest`, `canGround`,
`groundFirst`) stop driving routing and can retire.

---

## Workstream II — GROUND becomes the graph's bottom rungs
**Now:** GROUND is a separate scene (`/ground`) with its own item model (`buildGroundItem`:
structure/count/numeral/sum/produce) and gate (`ground-gate.ts`) — **not** skills in `SKILLS`.
**Change:** the acquisition rungs become **real graph skills** (`subject:'maths'`) at the very
bottom. `/practice` **dispatches on the skill's item format** — a numpad skill renders
InputStage; a GROUND-format skill renders the Structure/Choice/Produce scene as a peer under the
practice page. Recognition rungs stay **non-sprintable scaffolds**; only `produce` is a
production rung. The `ground-gate` "grounded" criterion is replaced by the standard θ/accuracy
gate every skill uses; `/ground` and `ground-gate.ts` mostly retire.

**This is the same multi-format seam as spelling** (the practice flow rendering more than a
numpad). Doing WS II properly *is* the groundwork that unblocks the spelling letter pad in the
real flow — not just the demo. Treat it as shared infrastructure.

### Decision 1 — LOCKED: **below-and-keep, with a rung-level duplicate audit**
GROUND (pre-symbolic *meaning*) sits **below** the emoji on-ramp (`more_or_less`,
`count_within_10`, `add_within_5` — first *symbols*): concrete → representational → abstract,
genuinely different layers, not two floors. **But audit for duplicate rungs.** GROUND's `count`
and the on-ramp's `count_within_10` are close enough they may be one skill in two costumes.
- **Merge two rungs** only if a child fluent at one is *necessarily* fluent at the other **and**
  the response mode measures the same thing.
- **Keep both** wherever recognition-vs-production differs (tap-the-picture ≠ type-the-answer).
- **Residual doubt → the calibration monitor is the instrument:** if two skills' θ move in
  lockstep for every child, they are one skill — merge then, on evidence.

---

## Workstream III — speed dissolves into practice
**Now:** a separate `/sprint` flow (timed batch on one skill), a milestone worth a 3-unit bonus,
entered via ⚡/offer.
**Change:** there is **no separate speed run.** Practice already measures every item's interval
client-side. A skill earns its **diploma** when, during ordinary practice, it is both
**accurate** (in the building band) *and* its recent clean practice rate crosses its aim —
witnessed passively, no timer ever shown. The crossing pays **nothing extra** (`MILESTONE_BONUS`
dropped); the session already earns its 1 point. The child just practises; occasionally a
session *ends* "**Grattis, du fick diplom i X!**".

### Decision 2 — LOCKED: the diploma moment is the **done-screen**, not mid-session
Emphatically. The instant version isn't just noisier — it is an **optimizable moment**: a child
who learns diplomas can pop mid-session gains a reason to rush the back half of every session to
trigger one, which is exactly the speed-grinding the design refuses. The done-screen version:
- makes the crossing **invisible during play** — nothing to chase, because nothing is announced
  until the session is already over;
- **batches** multiple crossings into one calm sentence;
- preserves **peak-end**;
- is the honest framing — the diploma **witnesses something that already happened**, it is not a
  prize the child just won.

### REQUIREMENT A — SHADOW FIRST (mandatory; no child's diploma depends on this until it passes)
**Practice-rate is not sprint-rate, and the aims were calibrated against sprint-style batches.**
A sprint is a warmed-up, go-fast batch on one skill with the same problem shape repeating.
Practice is interleaved — every item arrives after a context switch — and the app is **calm by
design: there is deliberately no reason to hurry.** So passive rate measures **habitual pace, not
capability.** A fluent-but-relaxed child may simply never cross; an unguarded cutover risks a
diploma that **measures temperament** — or one nobody can earn, or one that pops for anyone who
naturally hurries.

Protocol (exactly the GROUND shadow discipline):
1. Build the crossing detector to compute **passively, alongside the still-live sprint system**,
   writing **nothing user-facing**.
2. **The concrete check** (data already exists): **mouse has 7 skills measured genuinely fast in
   sprints** — do those *same skills* cross the *same aims* under clean first-try
   practice-interval measurement? Read agreement against known fluency before any cutover.
3. If practice rates read **systematically lower**, introduce a **practice-mode calibration
   factor on the aim — measured from that comparison, not guessed** (the same discipline that
   re-anchored the digit ceiling twice).
Only after shadow agreement does WS III's done-screen diploma go live.

### REQUIREMENT B — the crossing is a STORED EVENT, not a recomputation
This is the **fourth door of the stored-value-vs-live-threshold bug class** closed three times
already. "everMilestonedSkills re-sourced from that crossing" must **not** mean derived from the
ledger against *current* aims on each replay — that would let every future aim adjustment
**silently rewrite diploma history.**
- The crossing is **written at detection time with its inputs snapshotted**: aim, floor, window,
  rate, skill, timestamp — mirroring the sprint award-time snapshot.
- **The sprint ledger stays forever.** It is append-only, it feeds `earnedFluent`, and mouse's
  six diplomas plus the others live on it. **Only the sprint UI retires — deleting the flow must
  never delete the evidence.**
- The practice-crossing event is a **new append-only source** of the same "earned fluent" fact;
  `earnedFluent` / `everMilestonedSkills` **unions** sprint-milestones and practice-crossings,
  neither re-litigated against a moving aim.

**Touch:** a per-skill **practice-rate** read from the attempt ledger (clean first-try-correct
intervals, windowed) → the same digit-adjusted aim + tap floor; a new snapshotted
**practice-crossing** event store; `earnedFluent` unions both sources; drop `MILESTONE_BONUS`,
the `/sprint` page, the offer, the result screen; **keep** the sprint ledger and the diploma wall.

---

## Staging (each on-device-gated on the youngest's flow)
1. **Home → one Öva** (WS I) — pure routing; smallest, safest first.
2. **GROUND rungs into the graph, rendered in practice** (WS II) — the format-dispatch seam;
   tablet-check the Fler/Färre and produce rungs inside `/practice` before merge.
3. **Practice-rate crossing detector IN SHADOW** (WS III-a) — writes the snapshotted event,
   nothing user-facing; run the mouse-7-skills check; derive the calibration factor if needed.
4. **Cutover** (WS III-b) — done-screen diploma from practice-crossings; drop the sprint UI + the
   bonus (ledger kept). **Only after shadow agrees.**

## Engine boundary / stop-flag
Selector, θ, gate, ledger, reward-per-session are reused. The three real changes are: routing
(trivial); a **second item modality in the practice flow** (bounded, shared with spelling); and
**re-sourcing the diploma trigger to practice-crossings + dropping the bonus** (behaviourally
load-bearing → shadow-gated). **Stop-flag:** rate stays a downstream read of the ledger, exactly
as sprint rate was — the moment WS III wants the *selector* or *θ* to reason about rate, stop and
reassess.

## Parked for the spelling step-2 report (do NOT solve here)
With one Öva per child, where does **subject choice** live when spelling lands — does the
selector **interleave subjects inside a single session**, or does a **parent set weighting**?
Whichever it is, **it must not quietly reintroduce the door we just deleted.**

## Named tradeoff (chosen with open eyes)
Precision Teaching's timed practice isn't only measurement — the *beat-your-own-rate* activity is
itself the fluency-building **intervention**; we are swapping **active rate-building** for
**passive rate-witnessing.** Uptake data says the de facto state was already fluency-via-volume,
so little is lost today. **But** if kids later plateau *accurate-but-slow*, some form of
self-chosen speed play is the lever to revisit — **let the data show the plateau first.**
