# Bug hunt: the fluency column, and display-vs-truth in the parent view

Investigate, report, then fix — in that order. Don't fix before you've explained
the cause, because the fix differs by cause and a wrong fix hides the bug. Show
evidence (file paths, quoted lines, real values) for every claim.

---

## 1. The trigger — what looks wrong

pig's parent-view skill table shows a **flyt (fluency)** column reading either
`17/17 (preliminärt)` or `10/17 (preliminärt)` on almost every skill — including
skills she has provably never practised (all the year-7/8 linear-equation skills
sit at seeded θ = -2.00 and still show `10/17 (preliminärt)`).

That can't be right. Fluency is per-skill sprint progress. A skill she has never
been served should show no fluency, not `10/17`. Two tells:
- The value is **uniform** — the same `10/17` cloned across dozens of unrelated,
  untouched skills. Real per-skill data is varied; a constant is a seed or a
  global leaking into a per-skill display.
- The compounds (`ooo_*`, `frac_add_*`, `lin_*` that are compounds) correctly show
  `—`. So the "—" path is right and the `10/17` path is the suspect.

**Primary question:** what does the flyt column actually compute, per skill, and
why does an untouched skill show a number at all?

Candidate explanations to check and rule in/out with evidence:
- It's a **session- or player-level** value (e.g. "10 of 17 items done") being
  rendered in a per-skill row — a scope bug.
- It's the **provisional/seeded** fluency (`rate_state = 'provisional'`, seeded
  from årskurs) being displayed as if it were measured. The `(preliminärt)` tag
  suggests provisional — but provisional rates were meant to *drive the gate
  quietly*, not to be shown to a parent as a fraction that implies real sprint
  progress.
- It's a **real** per-skill value computed against something wrong (e.g. counting
  all attempts family-wide, or defaulting a denominator).

Report which, with the query/function that produces the column and a few real
rows' underlying values.

---

## 2. The fix, by cause

- If it's **provisional/seeded** being shown as earned: distinguish them in the
  parent view. A provisional rate is a *guess the system made*, not something the
  child demonstrated — it should read differently (e.g. greyed, "ej övad", or
  simply blank) from a measured sprint rate. Never show a seeded value as a
  fraction that implies the child completed sprints she never did. (This matches
  `start-from-below.md`/`instrumentation.md`: `rate_source`/`rate_state` must be
  visible as the distinction it is.)
- If it's a **scope bug** (session/global value in a per-skill row): fix the
  query so the column is genuinely per-skill, and untouched skills show `—` like
  the compounds do.
- If it's **real but miscomputed**: fix the computation and add a test asserting
  an untouched skill reports no fluency.

Whichever it is: **an untouched skill must show `—`, not a number.** That's the
acceptance line.

---

## 3. While you're in there — audit the parent view for the same class of bug

The fluency column being wrong suggests "display doesn't match truth" may recur.
Check each parent-view column the same way — does the displayed value reflect a
real per-skill, per-child, earned quantity, or is something seeded/global/session
leaking in?

- **θ column:** confirm the shown θ is the child's actual per-skill estimate.
  Seeded θ (the flat -1.00/-1.80/-2.00 placeholder values for untouched skills)
  is *correct* to show — that's her real current estimate — but confirm it's
  labelled/understood as "seeded, not yet practised" rather than implying she was
  tested and scored low. A parent seeing -2.00 on year-8 algebra shouldn't read it
  as "she failed algebra"; she's never seen it. Consider showing untouched skills
  differently from practised ones.
- **årskurs column:** correct.
- Any **accuracy/diagnostic** rendering: confirm it's still the
  threshold-triggered *sentences* (bug-detectors), not a per-skill accuracy table
  (the report-card that `ui-lifecycle.md` §4.6 forbids). This was corrected before;
  confirm it didn't regress.
- **cards / map** counts if shown anywhere to the parent: confirm per-child.

Report each column: MATCHES (shows real earned truth), or DRIFTED (shows
seeded/global/session value misleadingly), with evidence.

---

## 4. The distinction to get right everywhere

The deep issue is one distinction the UI must respect consistently:

> **Seeded ≠ earned. A value the system *assumed* (from årskurs, from a
> cold-start seed, from a provisional rate) must never be displayed as though the
> child *demonstrated* it.**

Seeded θ is honest to show *as her current estimate*, but should be visually
distinct from θ she moved through practice. A provisional/seeded fluency should
not be shown as a completed fraction at all. Untouched skills should read as
untouched (`—` / "ej övad"), not as low scores or partial progress.

A parent should be able to look at the table and instantly tell: *what has my
child actually done*, versus *what is the system assuming until she gets there*.
Right now the flyt column fails that test on every untouched skill.

---

## 5. Acceptance

- The flyt column's computation is explained with evidence; the cause is
  identified (provisional-shown-as-earned / scope bug / miscomputed).
- An untouched skill shows `—` for fluency, never a number. Assert with a test:
  a skill with zero sprints and zero non-warmup attempts reports no fluency.
- Seeded/provisional values are visually distinct from earned values wherever
  they appear in the parent view — a parent can tell assumed from demonstrated.
- The accuracy rendering is still threshold-sentences, not a report-card table
  (no regression).
- Every parent-view column reported as MATCHES or DRIFTED with evidence.
- No child-facing screen is affected — this is the parent view only; the child
  still never sees θ, fluency fractions, or the full graph.

Report the flyt-column cause first, before any fix.
