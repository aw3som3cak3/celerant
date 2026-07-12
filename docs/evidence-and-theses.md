# Evidence: the probe, and the theses

Extends `instrumentation.md`. That document collects data for *tuning the
model*. This one collects data for *proving the approach works* — to a grant
reviewer, a skeptical teacher, or a journal. The two overlap but are not the
same, and the difference is one word: **transfer**. The model is judged by
whether it predicts the child's next answer. The *approach* is judged by whether
practising in it improves something the child never practised.

Read §1. The whole design rests on one artifact — a measurement the system
cannot game — and one discipline: writing down the prediction before seeing the
result.

---

## 1. Why θ going up is not evidence

θ rises because the child answers practised items correctly. Citing θ as proof
the app works is circular: θ is *defined* by that practice. Any practice app can
show its own internal score improving. A grant reviewer who has seen ed-tech
pitches has a reflex against exactly this, and rightly.

Real evidence has a specific shape: **improvement on something outside the
training loop.** Three sources, in ascending order of how convincing and how
much work:

1. **The application signal** — already in the ledger, zero new instrumentation.
2. **The probe** — a small fixed instrument, never fed to the model. The core of
   this document.
3. **A held-out transfer task** — the probe, used pre/post around a specific
   fluency event. The publishable version.

None of these is engagement. This project's anti-engagement design is a
*credibility asset* here: you can state honestly that you do not optimise for
time-on-app, then show that the thing you *do* optimise for moved. Lead with
that in any application.

---

## 2. The probe — build this first

A probe is a fixed set of problems, administered on a schedule, that **never
counts toward θ, never appears in practice, and never enters any adaptive
decision.** It is a clean ruler. Because it is outside the training loop,
improvement on it cannot be an artefact of the loop.

### 2.1 Table

```sql
CREATE TABLE probe (                 -- LEDGER. Append-only. Never read by the model.
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     TEXT NOT NULL REFERENCES player(id),
  probe_set     TEXT NOT NULL,       -- which fixed instrument, e.g. 'arith_v1'
  item_ref      TEXT NOT NULL,       -- stable id of the fixed item within the set
  features_json TEXT NOT NULL,       -- same feature schema as instrumentation §2
  given         TEXT,
  correct       INTEGER NOT NULL,
  latency_ms    INTEGER NOT NULL,
  administered_at INTEGER NOT NULL,
  probe_version INTEGER NOT NULL
);
```

The hard rule, enforced in code and asserted in a test: **nothing in `replay()`,
the selector, the θ update, or the unlock gate ever reads the `probe` table.** It
is write-only from the system's perspective and read-only from yours. If any
model path can see it, it is no longer a clean ruler and the evidence is void.

### 2.2 The fixed sets

A probe set is a hand-authored, *unchanging* list of items — not generated,
not adaptive. Same items every administration, so the measurement is comparable
over time. Author two to start:

- **`arith_v1`** — ~20 items spanning the component tiers: a few each of
  addition-with-carry, subtraction-with-borrow, the harder multiplication facts
  (the middle of the tables, where the problem-size effect bites), a division or
  two. Fixed operands. These never change.
- **`transfer_v1`** — ~10 *compound* items whose solution requires components the
  child drills but which are themselves never practised in this exact form:
  two-step arithmetic, a linear equation with specific numbers. This set exists
  to catch transfer — fluency in the parts showing up in the whole.

Items are fixed strings with known answers, stored in code (`probes.ts`),
validated by the same substitution check `verify.ts` uses. Version them; a
changed item is a new version and breaks comparability with the old.

### 2.3 Administration

- **Baseline at player creation.** Before the child's *first* practice item, run
  a short probe. This is the pre-measurement, and without it every later probe
  has nothing to compare against. It replaces the placement sprint that §4.5 of
  `ui-lifecycle.md` correctly removed from the flow — but note the difference: a
  probe *measures and records*, it does not gate or adapt. The child sees a few
  problems, gets the same quiet feedback as always, and the results go to the
  `probe` table and nowhere else.
- **Monthly cadence thereafter.** Once every ~4 weeks, one probe administration,
  offered (not forced) at the start of a session. Skippable; a skipped probe is
  a missing row, not a zero.
- **Event-triggered transfer probe.** When a component crosses its fluency aim
  (`fluency-addendum.md`), administer `transfer_v1` within the next few sessions.
  This is the pre/post pair that tests the Morningside claim directly.

Keep it short. A probe that feels like a test induces the anxiety the whole
system avoids. Frame it to the child no differently from practice — same screen,
same tone. The child should not know it's a probe. (This is fine ethically: it's
the same problems they'd see anyway, just fixed and unscored.)

### 2.4 The application signal — free, build now

No new instrument. From the existing ledger: when a component's rate crosses its
aim, compute median `latency_ms` on *compound* attempts containing that component
before versus after. A drop is transfer — the Morningside thesis, per child.
Expose it in the parent view as a plain chart, and include it in the export. It
is your cheapest real evidence and it needs only a query.

---

## 3. Pre-registration — the discipline that makes it proof

A result is only evidence if the prediction was fixed *before* the data. Your
append-only ledger with timestamps is the ideal instrument for this: it proves
you did not move the goalposts.

Mechanism, deliberately low-tech:

```sql
CREATE TABLE prereg (                -- Append-only. Written before data collection.
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  thesis_id   TEXT NOT NULL,         -- 'T1', 'T2', ...
  statement   TEXT NOT NULL,         -- the falsifiable prediction, verbatim
  measure     TEXT NOT NULL,         -- exactly how it's computed from the ledger
  threshold   TEXT NOT NULL,         -- what counts as confirmed vs refuted
  registered_at INTEGER NOT NULL,
  outcome     TEXT,                  -- filled in LATER: 'confirmed'|'refuted'|'inconclusive'
  resolved_at INTEGER
);
```

Write the thesis, the measure, and the threshold. Leave `outcome` null. Fill it
only after the data is in. A thesis whose `registered_at` predates its
supporting attempts is credible; one written after is a story. For a grant, also
keep the statements in a dated public commit — git history is a second,
independent timestamp.

---

## 4. The theses

Tiered by how much data they need. Register the ones you can defend now; register
the population ones *before* the population arrives so they're honest when it
does.

The discipline throughout: **each must be able to come out false.** A thesis that
can't fail proves nothing when it passes. Where a thesis is likely to be *partly*
wrong, say so in the statement — a pre-registered "we expect this only for
components already at accuracy" is stronger than a blanket claim that gets
quietly narrowed later.

### Tier 0 — defensible from day one, n=2

**T1 (fluency → transfer, the core claim).**
*When a child's rate on a component crosses its fluency aim, their median latency
on compound items containing that component decreases, without the compound skill
itself having been practised more.*
Measure: median `latency_ms` on compounds containing the component, 10 attempts
before vs after the aim-crossing. Threshold: a decrease, per component, reported
per child — n=1 results stacked, not pooled. This is the Morningside thesis and
your single most important claim. It is measurable today, from the ledger, with
two children.

**T2 (desirable difficulty is tolerable).**
*Children sustain practice at ~80% success without rising abandonment — i.e. the
80% target is not so hard that children quit.*
Measure: session completion rate and `ended_early` rate against the running
first-try accuracy. Threshold: completion stays flat or rises as accuracy holds
near 0.80. This one can genuinely fail — if children bail when it's hard, you'll
see it, and that's a finding worth having.

### Tier 1 — needs one classroom, ~20–30 children

**T3 (probe improvement exceeds practice-set improvement).**
*Improvement on the held-out `arith_v1` probe tracks practice, confirming the
gain is real learning and not item-specific familiarity.*
Measure: probe accuracy and latency, baseline vs 3 months, against practice
volume. Threshold: probe scores improve with practice volume across children.
The falsification: probe flat while θ climbs would mean the app teaches its own
items and nothing transfers — the exact failure the probe exists to detect.

**T4 (the fluency gate earns its cost).**
*Children gated into compound skills only after component fluency solve those
compounds with fewer misses than a naive accuracy-only gate would predict.*
Measure: first-attempt accuracy on newly-unlocked compounds, compared against
the same children's accuracy on compounds they reached under the interim
accuracy-only gate (you have both, historically). Threshold: fluency-gated
unlocks show higher first-try accuracy. Tests whether Morningside's "fluent
before compound" actually buys anything, or is ceremony.

### Tier 2 — needs the population, hundreds of children

**T5 (feature-level difficulty is real and orderable).**
*Item difficulty within a skill varies systematically with the tagged features —
`7×8` is reliably harder than `7×2`, carrying harder than not, borrow-across-zero
its own difficulty spike.*
Measure: the LLTM fit from `instrumentation.md` §2, once fittable. Threshold: the
feature weights are ordered as the cognitive-load literature predicts, and
predict held-out accuracy better than the flat per-skill model. This is the one
that justifies the grant's headline — *usage improves precision* — and it is
unfittable until the population exists. Register it now anyway.

**T6 (the graph's prerequisite edges are correct).**
*Skills unlock in an order where post-unlock accuracy does not collapse — i.e.
the hand-authored `requires` edges actually capture prerequisite structure.*
Measure: `handoff.md` §7's first detector, run across all children — frequency of
post-unlock accuracy collapse per edge. Threshold: collapse is rare; edges that
show it are mis-specified and get flagged. This turns your bug-detector into a
validation of the graph itself, at population scale.

### On T0-vs-population honesty

Register T5 and T6 now, with `registered_at` timestamped years before you can
resolve them. That is not premature — it is the point. When the population
arrives and the fit runs, a prediction dated three years earlier is dramatically
more credible than one written the week you got the data. The ledger makes this
free.

---

## 5. What NOT to claim

The theses above are narrow on purpose. Do not let the grant framing inflate them
into claims the data can't carry:

- Not "improves learning outcomes" — measure *transfer and retention*, named.
- Not "as good as a tutor" — you have no tutor arm and won't.
- Not "closes gaps" — you have no representative sample and no control group.
- Not any causal claim from within-app data alone — without a control, T1–T4 are
  strong *within-child pre/post*, which is honest; do not dress it as an RCT.

A grant reviewer trusts the applicant who states these limits unprompted. The
honest scope *is* the credibility. Claiming less than you can't prove is how you
get funded to prove more.

---

## 6. Acceptance

- No model path reads `probe` or `prereg`. Assert it: a test that greps the
  selector, θ update, unlock gate, and `replay()` for those table names and
  fails if found.
- Baseline probe runs before a new player's first *practice* item, and its rows
  are marked baseline.
- Dropping `probe` and `prereg` changes no θ, no rate, no unlock — same firewall
  test as the motivational layer (`motivation.md` §5), extended to these tables.
- Export carries `probe`, `prereg`, and the application-signal query output.
- Every `prereg` row's `registered_at` is enforced to predate the first `probe`
  row that resolves it — a trigger or a test. A thesis resolved by data older
  than its registration is inadmissible and the system should refuse to mark it
  confirmed.
- `probes.ts` items pass the same substitution check as `verify.ts`.

---

## 7. Order of work

1. **The probe table, `probes.ts`, and baseline administration.** Every month
   without it is a baseline you can never retroactively collect — same logic as
   feature tagging, and for the same reason: pre-measurements don't come back.
2. **The application-signal query.** Free, from the existing ledger, and it's T1
   — your best claim. Build it the same week.
3. **The `prereg` table, and register T1 and T2 today.** Before more data
   accrues.
4. Monthly and event-triggered probes.
5. Register T3–T6 with honest future-dated statements.

The probe is to your *evidence* what feature-tagging is to your *model*: the
cheap thing now that the whole case depends on later, and that cannot be
backfilled. Build it before you have users, so that the users you get are
measured from their first session.
