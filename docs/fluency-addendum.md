# Addendum: fluency, after Morningside

Extends `agent-brief.md`. Where the two conflict, this document wins for
anything inside a **sprint**, and the original brief wins everywhere else.

The Morningside Model of Generative Instruction (Kent Johnson, Morningside
Academy) descends from Ogden Lindsley's Precision Teaching. Its claim: a
component skill is not learned when it is *accurate*, only when it is
*fluent* — fast, effortless, retained, and available for composition into
compound skills. Fluent components generate compound performance that was
never directly taught. Johnson calls this generativity. It is the same
proposition as "fluency exists to free working memory," stated by people
who measured it.

Precision Teaching's instrument is the clock. This system's default is no
clock. Both are correct, about different things.

---

## 1. The line

**Time components. Never time compounds.**

A component is a fact the child already understands and is now making
automatic: `7 × 8`, `13 − 8`, `−4 + 9`. The child is retrieving, not
reasoning. Retrieval speed is the thing being trained, so measuring it is
the point.

A compound is a problem the child must think through: `3x + 7 = 22`.
Timing here measures the child's anxiety, not their ability, and creates
more of it.

Every skill in the graph carries `mode: "component" | "compound"`. Tiers 1–4
and 6 are components. Tiers 5, 7, 8 are compounds. Sprint mode is available
only for components. There is no code path by which a compound is timed.

---

## 2. Two modes

**Practice** — the existing screen. Untimed, adaptive, Elo-selected, one
problem at a time, worked solution on second miss. This is where compounds
live and where new components are first learned to accuracy.

**Sprint** — a component only, once accuracy is established. A fixed
duration (start at 30 seconds; 60 once endurance is being built), problems
of one skill code presented back to back, answers typed, no feedback during
the run. At the end: correct-per-minute and errors-per-minute, and the
child's own chart.

Sprint is opt-in. The child chooses it from a list of skills that are
sprint-eligible. It is never assigned, never scheduled, never nagged.

---

## 3. Accuracy first, then rate

A skill becomes sprint-eligible only at **≥95% accuracy over the last 20
practice attempts**. Frequency building on an inaccurate skill drills the
error in. This ordering is not optional and is the most common way people
get Precision Teaching wrong.

---

## 4. The tool-skill ceiling

Before any aim is set, measure the child's **writing speed**: one minute of
copying random digits, `see digit → write digit`. That rate is the physical
ceiling on every written math-fact rate they can ever produce.

An aim of 50 correct digits per minute is meaningless for a seven-year-old
whose hand produces 60 digits per minute of anything at all. Set each skill's
aim as a fraction of the measured ceiling — start at **0.55 × ceiling** — and
re-measure the ceiling each term, because it climbs.

Published Morningside aims for math facts fall roughly in the 40–60
correct-digits-per-minute band, but treat that as a sanity check on your
computed aim, not as the aim. I am not confident in those figures to the
digit; verify against Johnson & Street or the Haughton tables before you
trust them.

---

## 5. Celeration, not score

The child's chart plots **correct per minute** on a semi-logarithmic vertical
axis against calendar days. This is the Standard Celeration Chart, and the
log scale is the whole idea: on it, a constant *multiplicative* growth rate
is a straight line. The slope is celeration, read as a multiplier per week.
`×1.4` means forty percent faster each week.

Two lines: corrects (dots) climbing, errors (crosses) descending. The gap
between them is the story.

The chart belongs to the child. Show it to them after every sprint. **It does
not appear in the parent view.** A parent reading a celeration slope will
optimise it, and the child will start gaming the rate. The chart is a
thermometer, and thermometers stop working when the patient is graded on them.

Self-competition only. The comparison is always to the child's own last line,
never to a sibling, never to an aim line drawn by someone else. Draw the aim
line, but draw it faintly.

---

## 6. RESA: fluency is not the same as a fast score

A skill is not retired at the aim. It is retired when it survives four
checks — Lindsley's RESA, as Morningside uses it.

- **Retention.** Re-sprint after 14 days with no intervening practice. Rate
  should hold within 90% of the aim. If it doesn't, the skill returns to
  practice. This is already what your spacing decay does; wire the retention
  check to fire when `decay(s)` crosses threshold.
- **Endurance.** The same rate must survive a run three times as long. A child
  who hits the aim for 20 seconds and collapses at 60 has speed, not fluency.
  Promote sprint duration 20s → 30s → 60s at the aim.
- **Stability.** The rate holds with distraction present. Practically: don't
  build a distraction feature, just don't insist the room be silent.
- **Application.** The component appears inside a compound and does not slow it
  down. This is the payoff and the only one that matters.

Application is measurable and you should measure it. Record `latency_ms` on
compound items (you already do; you just never show it). When a child's
`mult_table_7` rate crosses its aim, their median latency on compound problems
*containing* a ×7 should drop. If it doesn't, the component was drilled to a
score rather than to fluency. That correlation is the whole Morningside thesis,
tested on one child. Log it.

---

## 7. What changes in the graph

The unlock criterion in §4 of the brief becomes a conjunction, checked
transitively — every prerequisite must itself be unlocked, not merely present:

```ts
unlocked(s) = s.requires.every(r =>
    unlocked(r)                             // transitive: the chain holds
    && theta(r) >= 0                        // accurate (β is gone; handoff §1)
    && (mode(r) === "compound" || fluent(r))   // and, if a component, fluent
)
```

Transitivity matters because cold start seeds θ for *every* skill, compounds
included; a direct-only check lets a two-levels-up compound slip past the
component-fluency gate the graph exists to enforce.

### fluency is three-valued, not a boolean

The naive `rate(r) >= aim(r)` has a missing-evidence bug. A child who has
never sprinted has no rate at all, so the comparison is false — not because
they are slow, but because nothing has been measured. Absent evidence and
negative evidence must not collapse to the same boolean; the rest of the
system is careful about exactly this (θ is *seeded*, not defaulted; K decays
with n_obs so ignorance is plastic). So `rate` is three-valued:

- **measured** — at least one sprint exists. Real evidence. `fluent` iff
  the latest sprint rate ≥ aim. A single sprint below aim drops the skill
  and sends it back to practice — measurements are not averaged against seeds.
- **provisional** — seeded from the child's school year (and from placement,
  below), never sprinted. Treated as real and satisfies the gate when seeded
  at the aim; cheap to overturn, as one sprint replaces it outright.
- **unknown** — no sprint and no seed. Only possible before placement has run.
  `unknown` must never silently satisfy or fail the gate. If the selector ever
  reaches a prerequisite whose rate is `unknown`, that is a bug — placement did
  not run — and the code asserts on it.

Every `ability` row carries `rate` and `rate_source: 'seed' | 'sprint'`. The
parent view distinguishes them: a provisional rate is a guess the system made,
not one the child earned.

### placement — test down, not up

A new student is not marched upward from number bonds; they are tested
*downward* until the floor is found. On first login, after the tool-skill
measurement, a proctored placement sprint is administered at the highest
arithmetic component tier the child's school year predicts. Hitting the aim
sets the floor there and retro-satisfies every component tier at or below it
to provisional-at-aim — the child does **not** sprint the tiers beneath their
floor. Missing drops one tier and repeats; two consecutive misses without a
hit means start at tier 1, honestly, and the outcome is recorded durably.

`ax + b = c` still waits for the arithmetic it needs to be *fast* — but a
ten-year-old who can already do that arithmetic demonstrates it once, at
placement, rather than grinding every fact beneath it. Climbing from zero is
the remediation path, arrived at by measurement, not the default arrived at by
its absence.

---

## 8. What does not change

The default screen is still one equation and one input. Sprint mode is a
door the child opens, not the room they arrive in. There is still no score
outside the chart, no medal, no streak, no reminder, and no comparison
between children.

And there is still no clock on an equation the child is thinking about.

---

> **Superseded by `ui-lifecycle.md` §2, §4.5.** `tool_rate` and `sprint` are
> ledgers keyed on `player_id` with a `voided_at` tombstone; rates live in the
> `ability` cache as `rate` + `rate_state`. And **placement is not a gate**: a
> child's first screen is a problem, not a timed writing test — provisional
> rates seeded from årskurs already satisfy the fluency gate. Tool-skill
> measurement runs only when a child opts into sprint mode.

## 9. New tables

```sql
tool_rate  (child_id, measured_at, digits_per_min)
sprint     (id, child_id, skill_id, duration_s, correct, errors, at)
```

`aim(child, skill)` is computed, never stored: `0.55 × latest tool_rate ×
skill.aim_factor`, where `aim_factor` defaults to 1.0 and is a per-skill knob
you will regret not having.

Celeration is fitted over the last 8 sprints of a skill by least squares on
`log(correct_per_min)` against day. Two sprints is not a slope. Show the
number only after four.

---

## 10. Build order

Insert after phase 3 of the original brief, before spacing.

1. `mode` on every skill. Assert at boot that no compound is sprint-eligible.
2. Tool-skill measurement. It is the first thing a new child ever does.
3. Sprint mode, 30s, one skill, no chart. Verify the 95% accuracy gate.
4. The chart. Semi-log, corrects and errors, faint aim line. Child-only route.
5. RESA: endurance promotion, retention re-check hooked to decay.
6. The dual unlock criterion. Re-run the phase-2 simulation; expect the graph
   to traverse more slowly. That is the intended behaviour, not a regression.
7. The application log. Compound latency against component rate. This one is
   for you, not the children.
