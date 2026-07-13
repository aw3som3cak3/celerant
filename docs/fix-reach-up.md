# Fix: let a ready kid climb — reach-up, scaled to how under-challenged he is

**Do these in order. Do not build reach-up first.** New play data changed the
shape of this fix: the problem isn't only that ready kids can't climb — it's that
they're spending most of a session on *trivial* items, and reach-up has to be
strong enough to overcome that, without becoming a wall for a fragile kid. That
tension is the whole design, and getting the sequence and the scaling right is
what resolves it.

Extends `handoff.md` §6, `fix-selector-pband.md` (the gate),
`start-from-below.md` (the two-miss retreat, whose mirror this is).

---

## 0. What the latest data showed (pre-gate, but diagnostic)

sailboat (correctly re-graded to åk4, coasting at 93%), his 55 real items by
predicted difficulty at serve time:

- **p ≥ 0.85 (trivial): 62%**
- p 0.70–0.85 (his real edge): 22%
- p < 0.60 (too-hard over-reach): 16%

The gate (now live) removes the 16% too-hard tail. But the mass of the problem is
the **62% trivial**, and the gate does nothing for that. A coasting 4th-grader
should spend most of his items at his 0.70–0.85 edge, not banking wins he already
earned. Cause: overdue easy skills keep winning on their **decay bonus**, and
there is no mechanism pulling him up. Spacing, with no upward counterweight, *is*
the ceiling.

This means two things for the fix:
1. Reach-up can't be merely occasional — a timid probe every ten items can't
   outrun a decay schedule constantly resurfacing easy skills. Its strength must
   **scale with how under-challenged the child currently is.**
2. The decay term itself may be too strong. Check that *before* compensating for
   it with reach-up, or you'll be fighting one bug with another.

---

## 1. Step one — confirm the gate works in real play (change nothing)

The session that revealed all this **predates the gate**. The gate is live but
untested in play. Before adding any upward mechanism:

- Let one real multi-kid session run under the gate alone.
- Confirm the too-hard tail is gone: **zero** items served below the band to
  mouse or sailboat. Report each child's served-item p-distribution, same table
  as §0.
- Only once the downward guarantee is confirmed in real play do you proceed. The
  gate's downward protection is the load-bearing safety property; do not layer
  reach-up on top of an unverified gate, or a bad next session can't be
  attributed to the right cause.

**One variable at a time.** Do not deploy reach-up in the same window as anything
else.

---

## 2. Step two — check whether the decay term is over-resurfacing

Before building reach-up, diagnose the trivial-item glut at its likely source.

- For a **mastered** skill (high θ, low volatility), how often is it being
  resurfaced by the selector? Measure the actual inter-serve interval for mastered
  skills in the real data.
- Compare to what spacing should want: mastered material wants resurfacing on the
  order of **days**, not every few items. If mastered skills are coming back every
  few items, the decay term is miscalibrated — too strong — and that alone
  explains much of sailboat's 62% trivial.
- If decay is over-resurfacing, **turn it down** so mastered skills return on a
  retention-appropriate schedule, and re-measure the trivial proportion before
  building reach-up. Reach-up should climb a kid to new material; it should not
  have to fight a decay term that's over-eagerly dragging him back to old easy
  wins.

Report the mastered-skill resurfacing interval and whether you adjusted decay.
Reach-up is calibrated *after* this, against the corrected trivial proportion —
otherwise you'll over-tune reach-up to compensate for a decay bug and it'll be too
aggressive once decay is fixed.

---

## 3. Step three — reach-up, scaled to the trivial proportion

Now build the upward mirror of the two-miss retreat. The trigger is coasting; the
**strength scales with how under-challenged the child is.**

**The signal** (computed over recent items, e.g. last 10–15):
- recent in-band accuracy (high = ready),
- volatility (low/steady = solid, not lucky),
- **trivial proportion** — share of recent real items at p ≥ 0.85. This is the new
  ingredient. A high trivial proportion is direct evidence the child is being
  served below his edge.

**Behaviour, scaled:**
- **Not coasting / near edge already** (low trivial proportion): reach-up fires
  rarely or not at all. He's already where he should be.
- **Clearly coasting** (high accuracy, low volatility, high trivial proportion):
  reach-up fires **firmly** — readily, and willing to climb more than one rung if
  he keeps acing the probes. The evidence he's under-challenged is overwhelming
  and the cost of a miss is near zero, so timidity here is the wrong choice. This
  is the sailboat case, and a gentle probe every ten items would leave him stuck
  at 62% trivial.
- Always serve the **closest** above-band skill first — climb by rungs, never a
  leap. "Firmly" means *more frequent probes and willingness to keep climbing
  while he keeps winning*, not *bigger jumps*.

**The safety constraints — unchanged and non-negotiable:**
- **A struggling kid never triggers reach-up.** mouse has low accuracy / high
  volatility / low trivial proportion → the trigger never fires for him at any
  scaling. The "never an expected miss" guarantee holds absolutely for anyone not
  coasting. This is why scaling reach-up *up* for coasting kids is safe: the
  scaling is gated behind demonstrated readiness, so it can't reach a fragile kid.
- **A reach-up miss never cascades.** It doesn't lower the floor, doesn't trigger
  a retreat, and — the one asymmetry vs. §3's firmness — after a miss the child
  gets a short stretch of comfortable in-band items before reach-up probes again.
  Firm on a coasting kid who's *winning*; patient after a miss. He climbs as fast
  as he keeps succeeding and pauses the moment he doesn't.

The net: a coasting kid is pulled to his edge quickly (because the trivial
proportion signal makes reach-up firm when he's clearly under-challenged), and a
struggling kid is never touched by it at all.

---

## 4. Step four — the parent nudge (the audit)

As before: flag a child who is sustainedly acing everything in the parent view —
*"[icon] is getting almost everything right — they may be placed low. You can
raise their year."* One calm sentence. It never auto-acts.

Its job now is doubled: it's both the manual escape hatch and the **audit on
reach-up**. If reach-up is working, a coasting kid climbs on his own and the nudge
rarely fires. If a kid is still acing everything *despite* reach-up, the nudge
fires and tells you reach-up isn't strong enough yet — which, given the
trivial-proportion scaling, is exactly the signal you'd tune against. Keep both:
the mechanism and the check on it.

---

## 5. Acceptance

- **Gate confirmed first:** a real post-gate session shows zero below-band items
  for mouse and sailboat before reach-up ships. (§1)
- **Decay checked:** mastered-skill resurfacing interval is reported; if it was
  over-resurfacing, it's corrected and the trivial proportion re-measured before
  reach-up is tuned. (§2)
- A coasting kid with high trivial proportion (sailboat) is pulled to his edge:
  after reach-up, the share of trivial (p≥0.85) items in his session **drops
  substantially** and the share at his 0.70–0.85 edge rises. Assert on simulated
  and confirm on real next-session data.
- A struggling kid (mouse) is **never** served an out-of-band item, at any reach-up
  scaling. Assert.
- A reach-up miss leaves the floor unchanged, triggers no retreat, and is followed
  by in-band items before the next probe. Assert the no-cascade behaviour.
- Reach-up strength visibly scales: a kid at 60% trivial gets firmer/more frequent
  probes than a kid at 20% trivial. Assert the scaling, not just the on/off.
- No regression for a correctly-placed kid (pig): normal in-band interleaving,
  reach-up only when she's genuinely coasting.
- `handoff.md` §6 updated: band self-adjusts both edges — two-miss retreat down,
  trivial-proportion-scaled reach-up up — operating within the decay-corrected
  spacing schedule.

---

## 6. Why the order matters

Three things could each produce "too many easy items," and they need different
fixes: the gate removes too-hard (done), decay-correction removes over-resurfaced
easy (§2), reach-up adds the missing climb (§3). If you build reach-up first, it
has to compensate for a possible decay bug, which makes it too aggressive once
decay is fixed — and an over-aggressive reach-up is the one thing that could reach
a kid who isn't ready. Sequence protects the safety property. Gate, then decay,
then reach-up, one at a time, confirming each in real play.

The shape this completes: demonstrated behaviour overrides the initial guess in
both directions, safely — retreat down, reach-up up — with spacing tuned so it
resurfaces for retention rather than acting as a hidden ceiling. The grade is a
guess; θ is the truth; every mechanism that lets truth overrule the guess quickly
makes the system more honest and more kind at once.
