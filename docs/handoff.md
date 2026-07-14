# Handoff: the skill graph, and what it changes

Read `agent-brief.md` and `fluency-addendum.md` first. This document supersedes
parts of both. Where they disagree with this, **this wins**, and your first task
is to fix them in place rather than leave the contradiction in the repo.

Three files shipped with this brief and have now been integrated:

- `skills.ts` — 77 skills, complete. Generators, `year`, `mode`, `requires`.
  **Now lives at `src/skills.ts`** (the app imports it via `@/skills`), with a
  few app-facing helpers appended (`skillByCode`, `answerToString`,
  `generateCanon`, `schoolYear`, `seedThetaForChild`).
- `verify.ts` — the property suite. **Ported to `test/verify.test.ts`** and
  wired into the vitest run (CI); 80 checks, green. The `docs/` copies are kept
  as reference and excluded from the build (`tsconfig` `exclude: ["docs"]`).
- `contact-sheet.md` — five draws per skill, for the human. Left in `docs/`.

---

## 1. Delete beta

The brief's §5 has an Elo update on two quantities: child ability θ and item
difficulty β. **Remove β entirely.** Not "set it to zero at runtime" — remove
the column, the update, and the concept.

The reason: β appears in the model only as `θ − β`. Any constant in β can be
absorbed into θ. β's update aggregates evidence across children, and this
system has two children. β would never converge; it would drift, and its drift
would silently make θ non-comparable across time. Estimating item difficulty
from two subjects is not a model, it is noise with a coefficient.

So:

```ts
const p = 1 / (1 + Math.exp(-theta));    // beta is gone; it was always zero
const k = 1 / (1 + 0.05 * nObs);
theta += k * (correct - p);
```

Update on **first attempt only**. A retry after a miss is not independent
evidence. Grading of the update is unchanged from the brief: right-first-try
= 1.0, right-on-retry = no update, wrong-twice = 0.0, "I don't know yet" =
0.0 with `k` halved.

The unlock threshold `θ ≥ β` becomes `θ ≥ 0`, which reads plainly as
"predicted success on this skill is at least 50%."

Difficulty has not disappeared. It has moved into the shape of the graph,
where it always was.

### Schema changes

```sql
-- skill: drop `beta`, drop `n_obs`. Add:
ALTER TABLE skill ADD COLUMN year INTEGER NOT NULL;
ALTER TABLE skill ADD COLUMN mode TEXT NOT NULL CHECK (mode IN ('component','compound'));
```

`ability` keeps `theta`, `n_obs`, `last_seen_at`, and — per `ui-lifecycle.md`
§2, which supersedes the naming here — `rate` + `rate_state`
(`unknown`|`provisional`|`measured`), not `rate_source`. `attempt` remains
append-only, now a ledger keyed on `player_id` with a `voided_at` tombstone.
There is no `skill` table: skills live in code and `ability` keys on
`skill_code`.

---

## 2. Seeding

The only seed is θ, and the only input is the child's school year.

```ts
// Superseded anchor — kept for the record; see the correction below.
seedTheta(childYear, skill) = clamp(0.6 * (childYear - skill.year), -1.5, 1.0)
n_obs = 2   // the seed is a rumour, not a measurement; keep k high
```

> **Correction (re-anchored).** The formula above put every skill two-plus years
> behind the child at p≈0.73 — nearer the 0.80 target than the child's own year
> (p=0.5) — so the selector opened a competent child on number bonds. The seed
> is now anchored so the child's *previous* year sits at the target:
> ```ts
> seedTheta(childYear, skill) = clamp(1.4 + 0.8 * (delta - 1), -2.0, 3.0)  // delta = childYear - skill.year
> ```
> δ=1 → p≈0.80 (last year, warm-up), δ=0 → p≈0.65 (this year), δ=3 → p≈0.95
> (served only by the spacing term). `n_obs = 2` unchanged.

`skill.year` is the Swedish school year (Lgr22 central content) in which a
child would normally have that skill automatic. It is in `skills.ts`. It is
the only judgement call in the entire difficulty model.

Three or four real attempts and the seed is gone. That is the intent.

---

## 3. Why the graph is cut where it is

`skills.ts` is not an arbitrary list. Each skill is one **seam** in Sweller's
element-interactivity sense: one cognitive operation that can be present or
absent, costing working memory when present.

- `add_2d_no_carry` and `add_2d_carry` are separate skills because the carry
  is a distinct competence.
- `sub_3d_borrow` and `sub_3d_borrow_across_zero` are separate because
  borrowing across a zero is its own famous bug site (Brown & VanLehn).
- Each multiplication table is its own skill. The problem-size effect is real;
  a child fluent in ×2 is not thereby fluent in ×7.
- `lin_neg_solution` and `lin_neg_coefficient` are separate from
  `lin_ax_plus_b`, because a negative solution and a negative coefficient are
  different operations, not harder versions of the same one.

This is Fischer's LLTM in spirit: difficulty is a property of operations, not
of items. We cannot *fit* the operation costs from two children, so we do not
try. We encode them as structure instead.

**Do not merge skills to shorten the file.** Every distinction absent here is
a distinction the system can never learn, no matter how much data arrives.

If you add a skill: it must be one seam, it must have a `year`, its `steps`
must be genuine intermediate lines, and `verify.ts` must pass.

---

## 4. Invariants `verify.ts` already enforces

Wire it into CI. It currently checks, over 500 deterministic draws per skill:

- Substituting the answer into the prompt yields a true statement.
- The final step states the answer. (Fractions: reduced. A child shown `4/6`
  and marked wrong for writing it has been lied to.)
- No degenerate items: `1x`, `+ 0`, `0x`, non-integer answers.
- No single answer value appears in more than 40% of draws.
- Every `requires` edge resolves; the graph is acyclic.
- **No component requires a compound.** The fluency gate would otherwise ask a
  compound for a rate it can never have, since compounds are never sprinted.

Add one more check when you implement placement: no skill is reachable whose
prerequisite rate is `unknown`.

---

## 5. Unlock, restated with all corrections folded in

From `feedback-placement.md`, which stands:

```ts
unlocked(child, s) =
  transitiveRequires(s).every(r =>
    theta(child, r) >= 0                                   // accurate
    && (BY_CODE.get(r).mode === 'compound'
        || rateState(child, r) !== 'unknown' && rate(child, r) >= aim(child, r))
  )
```

- **Transitive**, not direct. Direct-only lets `(8 + 5) × 5` unlock before
  `3 + 4 × 2`.
- `rateState` is three-valued: `measured` | `provisional` | `unknown`. An
  `unknown` rate is not a failed rate. If the selector ever reaches an
  `unknown`, placement did not run — assert, don't shrug.
- Placement tests **down**, not up. Hitting the aim at a tier retro-satisfies
  every component tier below it as `provisional`.
- Do not touch `aimFactor` or `AIM_BASE_FRACTION` to make a child progress.
  That certifies downstream components as fluent at a rate you just called
  insufficient.

`ancestors(code)` in `skills.ts` gives you the transitive closure.

---

## 6. Selection — a gate, then a rank

Target **p ≈ 0.80**, not 0.5. With β gone, `p = 1/(1 + exp(−θ))`.

**The p-target is a WALL, not a term** (corrected after a real regression: an
over-placed child was served p≈0.58 items because the 0.35·decay spacing bonus
outweighed the small p-penalty of a near-band skill — spacing climbed over the
target). Selection is two stages:

1. **Gate.** `eligible_now = eligible skills WHERE |p − target| ≤ P_BAND`
   (≈0.20). Nothing outside the band is a candidate — no matter how overdue or
   how newly unlocked. A too-hard skill *waits* until the child's θ rises to meet
   it (or its θ is re-seeded down). For a new/fragile player the target is the
   ~0.90 start-from-below value, which tightens the lower edge to ~0.70 so the
   floor and the gate agree.
2. **Rank within the band.** Penalise recency (interleaving), bonus overdue
   (spacing), small random tiebreak. These operate ONLY inside the band and can
   never drag an above-band skill onto the screen.

If the band is empty, serve the item closest to target **from the safe (easier)
side** — err too-easy, never too-hard. Failing down is safe; failing up is the
bug. (This replaced the "frontier introduction" slot, which deliberately served
below-band skills and was the same disease.)

The one line: **a child never sees a problem the system already expects them to
miss.**

**The band self-adjusts at BOTH edges (fix-reach-up.md).** The gate stops
too-hard items but not too-EASY ones: an over-graded or under-challenged child
grinds trivial wins, because overdue easy skills keep winning on decay and nothing
pulls him up (real data: a correctly-re-graded 4th-grader still spent 62% of his
items at p ≥ 0.85). Two demonstrated-behaviour overrides now move the band:

- **Retreat down** (start-from-below §5): two misses in a row drop the floor to
  the easy ground — a fragile child is caught.
- **Reach-up up** (fix-reach-up.md §3): a demonstrably *coasting* child (high
  recent accuracy, steady volatility, high trivial share) is served the closest
  skill just ABOVE the band — the next rung, never a leap — and the *firmness*
  scales with the trivial share, so a kid at 60% trivial is probed far more often
  than one at 20% (a timid probe can't outrun the decay schedule). It fires 0 for
  anyone not coasting, so the "never an expected miss" guarantee holds absolutely
  for a struggling child at any scaling; and it goes quiet right after a miss —
  firm while he's winning, patient the moment he isn't, so a too-hard probe never
  cascades into a retreat. `reachUpProbability` computes the strength;
  `selectItem({reachUp})` serves the rung. The parent view also fires an
  `underplaced` nudge when a child aces everything AND is still served mostly
  trivial — both the manual escape hatch and the audit that reach-up is keeping up.

Decay was checked first (fix-reach-up.md §2): mastered-skill resurfacing measured
at ~9–14 items in real play — once per session, not every few — so decay is not
over-resurfacing, and reach-up is not compensating for a decay bug.

Log the full score vector into `attempt.item_json`. When the selector
misbehaves — it will — you need to see why it chose what it chose. (That log is
exactly what diagnosed this regression.)

---

## 7. Two queries to write now, for reading in a month

These are the only ways the graph can be wrong that matter, and neither is
visible on the contact sheet. Build them into the parent view as raw numbers.

1. **Missing prerequisite edge.** First-try accuracy on a skill collapses
   immediately after it unlocks. Something upstream isn't actually fluent.
2. **Trivial or mis-tagged skill.** Accuracy near 100% forever, θ climbing
   without bound. The item is too easy, or its `year` is too high, and it is
   stealing practice time.

The children are the test suite for the graph. `verify.ts` is only the test
suite for the arithmetic.

---

## 8. Build order, revised

1. Drop β. Migrate. Re-run the phase-2 simulation; it should still land mean
   first-try accuracy in [0.75, 0.85].
2. Load `skills.ts`. Seed θ from `year`. Assert `verify.ts` green at boot.
3. Selector with transitive unlock, accuracy gate only. Ship it. A child can
   use this.
4. Tool-skill measurement, sprint mode, the fluency gate, placement-by-
   testing-down. Now the graph traverses properly.
5. Spacing decay, retention re-check.
6. The two queries in §7.

Then leave it alone and watch.
