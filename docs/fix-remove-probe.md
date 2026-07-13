# Fix: get the probe out of the child's way

Two changes, driven by two days of real use. The reasoning matters more than the
diff, so read §1 before touching code.

Precedence note: this **supersedes** `evidence-and-theses.md` §2.3 (baseline
probe before first practice) and adjusts `start-from-below.md`. Update those docs
in place so they don't contradict the code.

---

## 1. What the data showed

Two children, first two days.

- **pig (åk1)** — three full sessions, 96% correct, climbed from year-1 addition
  into two-digit addition and the ×2 table in a day. The design working. She
  *skipped* the baseline probe by pressing through it fast, and that skip is what
  let her reach winnable practice.
- **mouse (åk3), behind and self-conscious** — zero practice attempts, ever. His
  entire experience of celerant was a forced 19-item baseline probe. He genuinely
  tried, scored 4/19, spent ~7 minutes failing, and left when practice finally
  opened — without answering one practice problem.

The only structural difference between the kid who thrived and the kid who
bounced: pig escaped the probe, mouse endured it.

The probe is a measurement calibrated to find a child's edge — which means, for a
child who is behind, it is calibrated to make him miss most of it. It is
therefore **guaranteed to make a fragile kid fail first**, which is the exact
scenario `start-from-below.md` exists to prevent. Two specs collided and the
measurement instrument beat the pedagogy. That is the wrong winner.

The general rule this establishes, which should outlive this fix:

> **Anything added for the builder's benefit — probes, calibration,
> instrumentation — must never be the first thing a child touches. The child's
> first experience belongs to the child, and it must be a win. Measurement
> waits.**

There is also a second problem, which is your point and it's correct: **a child
cannot meaningfully consent to a probe.** "Would you like to do a baseline
assessment?" is not a question a 7-year-old can answer, and "offer it after
session 1" still assumes the child knows what they're saying yes or no to. So we
are not deferring the probe. We are taking it off the child's path entirely.

---

## 2. Change 1 — remove the baseline probe from the child's experience

- **No probe is ever administered to a child as a gate, a wall, or an offer.**
  Remove the baseline-probe step from the new-player flow completely. A new child
  goes from icon-pick straight into a start-from-below practice session. Nothing
  stands between them and their first winnable problem.
- **Do not replace it with a deferred or optional probe.** Not before session 1,
  not after, not as a child-facing "want to try some?" It comes out of the child
  path entirely. A child can't consent to a measurement they can't understand, so
  we don't ask them to.
- **Keep the probe mechanism in the codebase, dormant.** Do not delete the
  `probe` table, `probes.ts`, or the scoring. The measurement is still valuable
  later — but as a **parent-initiated** action, run knowingly by an adult who
  understands what it is, never as anything a child stumbles into. Wire it behind
  the parent PIN as an explicit "run a check" the parent can choose, and leave it
  unbuilt in the UI for now if that's cleaner. The point is: dormant, adult-only,
  off the child's path.

The evidence layer loses its automatic baseline. That is an acceptable loss: an
uncontaminated first session that the child actually completes is worth more than
a baseline measurement that costs you the child. When you later want baselines,
an adult administers them deliberately. Note this tradeoff in
`evidence-and-theses.md` §2.3 — the clean baseline is now opt-in by a parent, not
automatic, and some children will have no baseline. The quasi-experimental
designs in `quasi-experimental.md` must tolerate missing baselines (they largely
already do — dose-response and crossover don't need one).

---

## 3. Change 2 — replay-all so existing kids get the easy floor

`mouse` was created before the start-from-below deploy, so he carries the old
grade-based seed and never got the easy floor. Any existing player is in the same
state.

- **Run replay-all across every existing player** so they pick up the
  start-from-below seed and the easy floor. After this, a returning kid's next
  session starts on genuinely winnable problems.
- Confirm the replay-all reproduces cache exactly for players who already have
  attempts (pig), and re-seeds cleanly for players who have none (mouse). The
  byte-for-byte replay test must still pass.

---

## 4. mouse is now a harder case than a new kid — seed him lower

`mouse` is not a blank slate anymore. He has a first memory of celerant as "the
thing where I got 4 out of 19 and left." The easy floor has to overcome that, not
just meet a fresh fragile kid.

- On his return, his opening must be **genuinely, obviously easy** — err lower
  than the standard floor. Let him bank several clean wins before the ramp climbs
  at all. He needs the win ratio to feel overwhelming early, because he's reading
  every problem through a prior failure.
- The two-consecutive-miss retreat (`start-from-below.md` §5) matters most for
  him. Make sure it's active for a replayed player, not just a freshly-created
  one.

Do not over-engineer a special case for one child. But make sure the existing
start-from-below floor is *low enough* that a kid returning from a bad first
session lands on wins. If the floor was tuned for a fresh fragile kid, check it
still holds for a scarred one.

---

## 5. Acceptance

- A brand-new child, created after this change, reaches a practice problem with
  **zero** intervening probe/assessment items. Trace the new-player path and show
  it.
- No child-facing route administers, offers, or gates on a probe. Grep the child
  flow for probe references; there should be none.
- The `probe` mechanism still exists and is reachable only behind the parent PIN
  (or is cleanly dormant/unwired), never from the child path.
- replay-all runs; pig's cache reproduces byte-for-byte; mouse re-seeds to the
  easy floor. The replay-equality test passes.
- A simulated behind-kid (true level below the floor) created after the change
  opens on problems he can solve, and two early misses trigger retreat, not hold.
- `evidence-and-theses.md` §2.3 and `start-from-below.md` are updated in place to
  match: baseline is parent-initiated and optional, not automatic; some children
  will have none.

---

## 6. What this does and doesn't fix

Fixes: no new child ever again meets a wall of failure before reaching winnable
practice. The thing that cost you mouse's first session is gone.

Does not fix: mouse's first session already happened. The replay gives him a
winnable *next* session; it can't erase the first. Whether he comes back is not a
software question, and if he doesn't, that isn't the fixed tool failing — it's
the old tool's damage, which the fix came too late to prevent. The real test of
start-from-below is the **next behind kid who meets the fixed version cold**, with
no prior bad session. Watch that kid, not mouse.

Do the two changes. Report the new-player path start-to-first-problem so I can see
there's nothing in the way.
