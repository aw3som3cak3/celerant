# Grade: one source of truth, hidden from kids, seeded low

Three changes, but they share one root and must be built around it, or #2 and #3
will collide into a double-offset bug. Read §1 first — it's the principle the
other two depend on.

Extends `ui-lifecycle.md` §4.3 / §5.2, `start-from-below.md`, `handoff.md` §2.

---

## 1. The root: exactly ONE place applies the grade→seed offset

start-from-below errs low on purpose: a too-easy opener costs a moment of
boredom, a too-hard one costs a fragile kid his confidence. So the grade a parent
picks is seeded **one year below** for θ.

The danger: if that minus-one offset is applied in more than one place (create,
grade-change, display), it compounds — click åk4, get åk2 or worse. That is the
suspected bug in #3.

**The rule, enforced everywhere:**

> There is exactly one function that turns *the grade the parent chose* into *a θ
> seed*, and the minus-one offset lives **there and only there**. Every other part
> of the system — create, grade-change, parent display — speaks in **chosen
> grade**, never in seed grade. `player.school_year` stores the **chosen** grade
> (what the parent picked, the grade the child is *in*). The offset is applied
> only at the moment of seeding, and is invisible everywhere else.

Before changing anything, find every place the grade is read or transformed and
confirm where the offset currently lives. Report each site. The fix for #3
depends on what you find (§4).

---

## 2. Remove the grade from every child-facing surface (#1)

- Remove the grade label from the child's icon on the family screen, and anywhere
  else a child can see it. A grade is a status label; the icon-identity design
  exists specifically to avoid status labels, and the grade is meaningless to a
  child regardless.
- Grade remains visible in the **parent view only**, where it's a placement
  control, not a badge.
- Assert: no child-facing screen renders a grade number.

---

## 3. Only parents create children (#2)

- Move child creation entirely behind the parent PIN. A child can no longer create
  a player; the create-player flow is a parent action.
- The parent picks the grade the child is **in** (the grade they're entering /
  attending). Buttons `F 1 2 … 9` as before.
- `player.school_year` = the **chosen** grade. The minus-one for seeding happens
  only in the seed function (§1), not here. Do **not** store grade-minus-one in
  `school_year` — store what the parent picked.
- A child can still change their own **icon** (per the earlier change) — that's
  their space. They cannot create players or set grades.
- Date-correction still applies inside the seed function only: in summer
  (roughly June–mid-August) the chosen grade is the one they're *entering*, so the
  seed already reads correctly as grade-minus-one; make sure date-correction and
  the start-from-below minus-one don't *stack* into minus-two. If both exist,
  reconcile them into the single seed function so the total offset is intended,
  not accidental.

---

## 4. Diagnose then fix the grade-change offset (#3)

Reported symptom: changing a kid to åk4 in the parent menu places them at åk3.
**Diagnose before fixing — there are two causes with opposite fixes.**

- **Cause A — display bug.** The child is correctly placed at åk4 (seeded from
  åk3 internally), but the parent view *displays* åk3 — it's showing the seed
  grade instead of the chosen grade. Fix: the parent view displays
  `player.school_year` (the chosen grade, åk4); the minus-one stays inside the
  seed function and is never surfaced.

- **Cause B — double offset.** The minus-one is applied twice — once at
  create/seed and again at grade-change — so åk4 genuinely lands the kid a grade
  or more too low. Fix: remove the offset from the grade-change path;
  `updatePlayerYear` stores the chosen grade and calls replay, and the offset is
  applied only inside the seed function during that replay.

Report which cause it is, with the code path, before fixing. Then fix that cause.

After the fix, `updatePlayerYear(kid, 4)`:
- stores `school_year = 4` (chosen),
- replays, seeding from year 3 (chosen minus one) via the single seed function,
- folds the child's existing ledger over that seed (the grade-change replay
  guarantee you just tested),
- and the parent view shows **åk4**.

---

## 5. Acceptance

- The grade→seed offset exists in exactly one function. Grep confirms no other
  site subtracts from or adjusts the grade. Show the one site.
- `player.school_year` stores the chosen grade; a parent picking åk4 yields
  `school_year = 4`, seeded from year 3.
- Parent view displays the chosen grade (åk4), never the seed grade (åk3).
- No child-facing screen shows a grade at all.
- Child creation requires the parent PIN; no child-facing path creates a player.
- A child can still change their own icon (no regression).
- Date-correction and the start-from-below minus-one do not stack: total seed
  offset for a summer åk4 pick is the intended amount, not minus-two. Assert with
  a summer date and a winter date.
- Grade-change folds the ledger (re-run the grade-change replay test from the
  last fix; it must still pass).
- mouse: confirm he now reads åk1 in the parent view (you just set him), seeded
  appropriately, ledger folded — and that the display shows åk1, not "åk0/F"
  from a stray offset.

---

## 6. Why the single-source rule matters

Every one of these three changes touches "grade," and the bug in #3 is almost
certainly what happens when "grade" means two things — chosen vs seed — in
different parts of the code. Collapse it to one meaning stored
(`school_year` = chosen), one place transformed (the seed function, minus-one),
and one thing displayed (chosen). Then the offset can't compound, the parent sees
what they picked, and the child sees no grade at all. Build the single-source rule
first; #1, #2, #3 all fall out of it cleanly.
