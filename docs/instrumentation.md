# Instrumentation

Extends `handoff.md` (the model), `ui-lifecycle.md` (the ledger),
`motivation.md` (sessions and goals). This spec adds **no live behaviour**. It
records, into the append-only ledgers, the fields that a future offline analysis
will need and that cannot be recovered after the fact.

Read §1. The entire justification is one property: **the ledger is replayable,
so anything stored in it can be analysed retroactively — and anything not stored
is gone forever.** Every un-tagged session between now and the day you have
enough children is data you do not get back.

This has a deadline in a way nothing else in this project does. Ship §2 first
and alone if you have to.

---

## 1. What this is for, and what it is not

The goal is **feature-level difficulty**: eventually learning that `7 × 8` is
harder than `7 × 2`, which the current per-skill model cannot see because they
share one node. That estimate only becomes fittable with a population — hundreds
of children per feature-cell. You do not have that yet.

So this spec does **not** fit anything, add any model, or change any θ. It makes
the data *exist* so that when the population arrives, the fit is a weekend of
offline work rather than an impossibility. The LLTM fit itself is explicitly out
of scope and must not be built now (§6).

The same logic applies to the family-goal and session mechanics: you want to
understand how they actually drive usage, and that understanding is only
possible if the events were logged as they happened. §4.

---

## 2. Feature-tag every item — do this first

Every generator in `skills.ts` already computes the quantities below; they are
currently thrown away. Record them into `attempt.item_json` at generation time,
under a `features` key.

### 2.1 The feature set

Store whichever apply to the item; omit the rest. All are cheap, all are known
at generation.

```ts
type ItemFeatures = {
  // operands, always
  operands: number[];            // [7, 8] for 7×8; [47, 28] for 47+28
  operation: "add" | "sub" | "mul" | "div" | "linear" | "fraction" | "order";
  answer_magnitude: number;      // |result|, bucketable later

  // additive structure
  carries?: number;              // count, not boolean — 2 carries ≠ 1
  crosses_ten?: boolean;
  borrows?: number;
  borrow_across_zero?: boolean;  // Brown & VanLehn's canonical bug site

  // multiplicative
  operand_max?: number;          // the "size" in the problem-size effect
  is_tie?: boolean;              // 7×7 — the tie effect

  // sign structure
  negative_operand?: boolean;
  negative_result?: boolean;
  solution_sign?: "pos" | "neg" | "zero";   // for linear equations

  // linear-equation shape
  var_both_sides?: boolean;
  has_parentheses?: boolean;
  coefficient?: number;          // the a in ax + b = c

  // fraction shape
  like_denominators?: boolean;
  requires_simplification?: boolean;
};
```

Add features freely as you author new skills. The rule: **if a generator's
parameter draw could plausibly affect difficulty, tag it.** A feature you don't
store is a hypothesis you can never test.

### 2.2 Where it goes

`attempt.item_json` already stores prompt, answer, steps, and the selector score
vector. Add `features`. Nothing reads it at runtime — it is written and then
left alone until an offline analysis reads it months later.

Do not create a separate table. The feature vector belongs with the item it
describes, in the same immutable row, so that replay and export carry it for
free.

### 2.3 Versioning

Add `features_version: 1` alongside. When you add or redefine a feature, bump it.
An offline fit must know which schema each row was written under, because a
`carries` that changed meaning between versions is worse than a missing one.

### 2.4 Acceptance

- Every new `attempt` row has `item_json.features` and `features_version`.
- The features are reproducible: regenerating an item from its stored seed
  yields the same feature vector. (This falls out if generators are pure.)
- `verify.ts` gains a check: for each skill, the tagged `operands` actually
  evaluate to the stored answer. This catches a generator whose features drift
  from its arithmetic.
- Export (`GET /family/:id/export`) includes features. It is the analysis
  substrate; if it's not in the export, the analysis can't happen off-box.

---

## 3. Per-child sharpness: RD and idle decay

Independent of population. Worth building at any scale. This is the useful half
of Glicko-2, applied one-sided — only the child's numbers move, against the
skill's *fixed* tier difficulty. **Do not rate problem types** (§6).

Extend `ability`:

```sql
ALTER TABLE ability ADD COLUMN rd         REAL NOT NULL DEFAULT 1.0;  -- rating deviation
ALTER TABLE ability ADD COLUMN volatility REAL NOT NULL DEFAULT 0.06; -- Glicko-2 sigma
```

Three changes to the update:

1. **RD replaces the crude `k`.** `k = 1/(1+0.05n)` was a confidence that only
   ever grew. RD does the same job but **grows during idle periods** and shrinks
   with practice. A skill unpractised for weeks becomes *uncertain again* — the
   child may have forgotten — so the next answer counts more and the selector
   knows to revisit. This is spacing affecting *belief*, not just scheduling,
   and it is the single highest-value change in this document after §2.

2. **A slip/lapse floor.** Cap how far one answer can move a low-RD (well-known)
   θ. A careless miss on a mastered skill must not crater the estimate. Standard
   in IRT as the lapse rate.

3. **Volatility feeds the fluency gate.** A child swinging between mastery and
   misses on a skill has high volatility — a genuine "not yet fluent" signal
   distinct from "low ability." Two children at 70% accuracy, one steady and one
   erratic, are different, and the steady one is ready to advance. Surface
   volatility alongside rate in the gate logic; it gets at fluency from the
   accuracy side, complementing the sprint rate.

**Replay must reconstruct RD and volatility too.** The byte-for-byte replay test
from `ui-lifecycle.md` §7 now covers all three numbers. This makes the test
stricter, which is correct.

Tune τ (the Glicko-2 system constant) conservatively — 0.4 to 0.6. Note in the
README that it is a guess and the phase-2 simulation should be re-run against it.

---

## 4. Log the mechanics so you can study them

You want to understand how family goals and sessions actually drive usage. That
is only answerable if the events were recorded as they happened. Right now the
schema stores *state* (a goal's current count) but not the *event stream* that
produced it, and you cannot reconstruct a history from a running total.

### 4.1 A goal is a ledger, not a counter

`motivation.md` §4.1 defined `family_goal` with a `reached_at`. That stores the
outcome, not the path. Add an event log:

```sql
CREATE TABLE goal_event (            -- LEDGER. Append-only.
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id   TEXT NOT NULL REFERENCES family(id),
  goal_label  TEXT NOT NULL,         -- denormalised: goals get cleared, history stays
  target      INTEGER NOT NULL,      -- the target at the time, in sessions
  kind        TEXT NOT NULL CHECK (kind IN ('created','progressed','reached','cleared','retargeted')),
  value       INTEGER,               -- new count for 'progressed'; new target for 'retargeted'
  at          INTEGER NOT NULL
);
```

Now every question you'll later want to ask is answerable:

- How many sessions did a goal take to reach? (`reached.at − created.at`, and
  the count of `progressed` events between.)
- How long in wall-clock time? Did pace accelerate near the goal, or stall?
- How often are goals set and then abandoned (`cleared` without `reached`)?
- Does having a goal at all change session frequency versus periods with none?
- What target sizes get reached versus abandoned? (Is 10 motivating and 40
  demoralising?)

`goal_label` is denormalised deliberately: goals get cleared and replaced, but
the history of what happened under each must survive independently. Never join
this to a live `family_goal` row that may be gone.

**Still never store per-child contribution.** `motivation.md` §4.1 forbids it,
and this log does not reintroduce it — `progressed` records the family-wide
count crossing a threshold, never which child triggered it. The privacy rule
outranks the analysis convenience. If a future question needs per-child
attribution, that question does not get answered.

### 4.2 Sessions already carry what's needed — confirm it

`session_run` (`motivation.md` §3.1) records `target`, `completed`, `ended_at`,
`ended_early`, `started_at`. That is enough to reconstruct session-level usage:
length, completion, abandonment, time-of-day, inter-session gap. Confirm two
things are actually populated:

- `ended_early` is set on the walk-away path, not left default. Abandonment is a
  signal you want, and it's only usable if it's honestly recorded.
- The inter-session gap is computable per (player, skill) — you need `started_at`
  and the ability's `last_seen_at`, both present. This is the raw material for
  ever checking whether the spacing is actually working.

Do **not** add engagement metrics beyond this — no "time to first tap," no
scroll tracking, no dwell time. The question is "how do goals and sessions drive
practice," not "how do we maximise engagement." The distinction is the whole
ethic of the project; instrument the former, never the latter.

### 4.3 A general event log for the motivational layer

One more append-only table, for the events that aren't attempts, sprints, or
goals but that you'll want to correlate against usage:

```sql
CREATE TABLE usage_event (           -- LEDGER. Append-only.
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   TEXT NOT NULL REFERENCES player(id),
  kind        TEXT NOT NULL,         -- 'card_earned','skill_chosen','difficulty_toggled','session_started','session_ended','en_till'
  detail      TEXT,                  -- skill_code, or the chosen option, etc.
  at          INTEGER NOT NULL
);
```

This answers the questions the map and the card shelf raise: does earning a card
predict another session? Does the "en till?" button get pressed, and by whom, and
after what? Does difficulty-toggling correlate with sticking or quitting? None of
these change behaviour; all of them are invisible to the child; all are in the
export.

---

## 5. What the export must now carry

`GET /family/:id/export` is the analysis substrate — the only way data leaves the
box for offline study. It must include, for the family and its players:

- every `attempt` with its `features` and `features_version`;
- every `sprint`, `tool_rate`, `session_run`;
- every `goal_event` and `usage_event`;
- the `ability` cache is **not** exported — it's derivable, and exporting a cache
  invites analysing stale numbers. Export ledgers; recompute cache offline.

JSON, one file, parent PIN. This is what you'll load into a notebook the day you
have enough children to fit anything.

---

## 6. Explicitly out of scope — do not build these now

| not now | why |
|---|---|
| the LLTM / feature-difficulty **fit** | needs the population you don't have. §2 collects the data; the fit is a later offline weekend. Building it now fits noise. |
| **ratings on problem types** (Glicko or otherwise) | this is the β we deleted. Two-sided rating of a fixed-difficulty item reintroduces non-comparable θ. §3 is one-sided against fixed tier difficulty, deliberately. |
| any **neural knowledge tracing** (DKT, SAKT, embeddings) | wants tens of thousands of learners; gives a less interpretable version of what one-parameter IRT already does. Not at this scale, possibly not ever. |
| an **LLM in the request path** | authoring and diagnosis are fine offline (writing a generator, naming a misconception in the parent view). Nothing generated or rated by a model touches θ or the child's screen. |
| **engagement instrumentation** beyond §4 | dwell time, funnels, retention curves. The project studies whether learning mechanics work, not how to maximise time-on-app. |

An agent that "helpfully" adds a problem-type rating or an LLM difficulty
estimator has broken the design. The features in §2 are the *only* path to better
question precision, and that path runs through more children, not more model.

---

## 7. Order of work

1. **§2 first, alone, now.** Feature-tag every item. Every un-tagged session is
   permanent data loss. This ships before anything else in this doc.
2. §4 — the event logs. Also cheap, also lossy if deferred. Ship close behind §2.
3. §3 — RD and idle decay. Worth it independent of population; do it when §2 and
   §4 are solid, since it touches the model and the replay test.
4. Everything in §6 stays unbuilt until the population exists to justify it.

The whole document is a bet that you'll get the children eventually, and that the
regret you're insuring against is arriving there with three years of logs missing
the one field that mattered. §2 is the premium on that insurance. Pay it now.
