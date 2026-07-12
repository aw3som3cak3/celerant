# Quasi-experimental evidence

Extends `evidence-and-theses.md`. That document built the probe (a clean ruler)
and the pre-registration table (honest predictions). This one builds the
*analyses* that turn probe data into causal evidence without a randomised
control group — because you have two children and later a few classrooms, never
a lab.

Read §1. Every design here answers one objection — "the children would have
improved anyway" — using data you already collect, by making each child, or each
untrained skill, serve as its own control. None of it is an RCT and the spec is
emphatic that you must never call it one. It also builds the one anti-metric the
project's ethics require: the displacement check.

This is analysis, not live behaviour. It reads the ledger and writes reports.
It changes no θ, no selection, no unlock. Like the probe, **no path here is ever
read by the model.**

---

## 1. The objection, and the three answers

Any before/after result invites: *children improve with time, schooling, and
maturation regardless of your app.* Without a control group you cannot dismiss
this by fiat. But you can design around it three ways, each using a different
internal comparison:

1. **Staggered baseline** — the maturation clock runs during the pre-practice
   period too; if the probe is flat then and rises only once practice starts,
   maturation doesn't explain the rise.
2. **Untrained-skill crossover** — a child drills family A while family B sits
   untouched; same child, same age, same classroom, so a gain on A but not B
   cannot be maturation.
3. **Dose-response** — if more practice yields more probe gain across children,
   the effect scales with the intervention, which correlation-without-gradient
   never shows.

Each is weaker than a randomised trial and stronger than a bare pre/post. Built
together, they triangulate: maturation would have to be implausibly skill-specific
*and* dose-shaped *and* timed to practice onset to fake all three.

---

## 2. Staggered baseline

The insight: children sign up at different times, and every child has a
pre-practice window (the baseline probe of `evidence-and-theses.md` §2.3, plus
any gap before they start in earnest). During that window they are aging and
being schooled but not using celerant. That window is the control.

### 2.1 What to compute

For each child, per probe set:

- **baseline slope** — change in probe score across administrations *before*
  meaningful practice began (requires at least two baseline points; see §2.3);
- **practice slope** — change across administrations *during* active practice;
- the contrast: practice slope minus baseline slope.

Pool the contrast across children (this one pools honestly — it's a
within-child difference, so between-child variation in ability cancels). A
positive contrast is the evidence: probes move faster once practice starts than
they did under schooling-and-maturation alone.

### 2.2 The confound to name, not hide

Regression to the mean and test familiarity both inflate a naive practice slope.
Two defences, both required:

- The **baseline must have ≥2 points** so it has its own slope to subtract, not
  a single pre-point that regression can distort.
- Report the **untrained-skill slope during the same practice window** (§3) as a
  within-child, within-window control for familiarity: if `arith_v1` rises while
  a never-practised probe family stays flat *across the same administrations*,
  familiarity with "taking probes" isn't the driver.

### 2.3 The cost

A two-point baseline means a child does a probe at signup and another ~2–4 weeks
later before the analysis has a baseline slope. Do **not** delay their practice
to get it — they practise normally; the baseline is just the first two monthly
probes, and "before meaningful practice" is defined post-hoc from actual practice
volume in the ledger, not by withholding. A child who sprints into heavy use
immediately has a short baseline and contributes weakly to this analysis but fully
to the others. That's fine; the designs are complementary.

---

## 3. Untrained-skill crossover

The cleanest internal control you have. A child's practice is not uniform across
skill families — the selector and their own choices concentrate it. So at any
window, some families are being trained and some aren't.

### 3.1 Design

Split the probe into family-tagged subscores (`arith_v1` already spans families;
tag each probe item with its family). For each child and each analysis window:

- classify each family as **trained** or **untrained** in that window, from
  actual practice volume in the ledger (a threshold, pre-registered);
- compare probe-subscore change on trained vs untrained families.

The prediction (pre-register it): trained families improve; untrained families,
measured on the same child in the same window via the same probe, do not — or
improve less. Because it's the same child at the same age, maturation and
schooling are held constant by construction.

### 3.2 The crossover, if it happens naturally

If a child later shifts practice from family A to family B, you get a true
crossover: A was trained-then-untrained, B the reverse, and each family's probe
slope should track *when* it was trained, not the calendar. Don't engineer this —
if the child's natural practice produces it, it's the strongest single-child
result in the whole project. Detect and report it; never force a child's
practice into an experimental schedule.

### 3.3 The honesty constraint

A family is "untrained" only if genuinely near-zero practice in the window.
Components shared across families leak — fluency in `mult_table_7` helps both
plain multiplication probes and any compound probe using ×7. Tag the leak: a
probe family is a clean control only for components it doesn't share with trained
skills. Where they share, say so and down-weight, rather than claiming a clean
control you don't have.

---

## 4. Dose-response

The most robust and the simplest. No baseline, no crossover — just: does more
practice produce more probe gain?

### 4.1 Compute

Per child, per probe interval:
- **dose** — number of first-attempt items practised in the interval (and, in a
  second model, sprint count, since fluency work may dose differently);
- **response** — probe-score change across that interval.

Across all children and intervals, fit response against dose. A positive slope
is dose-response: the effect scales with the intervention. Report it as a plain
scatter with a fitted line — dose on x, probe gain on y — because that single
figure is the most legible causal evidence a non-statistician reviewer will
grasp instantly.

### 4.2 Why it survives the maturation objection

Maturation is roughly constant per unit time; dose is not. A child who practised
heavily one month and lightly the next, and whose probe gain tracks the practice
rather than the calendar, has shown an effect that a constant maturation rate
cannot produce. Include a **calendar-time-only model** as the comparison: if dose
predicts gain better than elapsed time does, that's the result.

### 4.3 The reverse-causation note

State it plainly in any writeup: dose-response is consistent with "practice
causes gain" and also with "children who were going to improve practised more."
The staggered baseline (§2) and crossover (§3) are what rule the second out; the
three are reported *together* precisely so each covers the others' gap. Never
present dose-response alone as causal.

---

## 5. The displacement anti-metric — the one the ethics require

Every analysis above serves the outward case. This one serves the child, and it
is the more important of the two. The project's whole stance is that it does not
optimise for time-on-app. This makes that stance *checkable*, and gives you an
alarm when the tool is taking more than it gives.

### 5.1 What to measure

From `session_run` and `usage_event`, per child, plainly:

- sessions per week, and minutes per week if you have them, **plotted over time
  so a rise is visible** — not summed into a single engagement number;
- time-of-day distribution, with a flag for late-evening use (a proxy for "instead
  of sleep");
- the "en till?" acceptance rate over time — a *rising* rate is not a success
  here, it's a signal to look at whether the child is bingeing.

### 5.2 How it's framed, which is the whole point

This is the inverse of an engagement dashboard. Every number here is one you want
to stay **low and flat**, and the parent view presents them that way: not "great,
30 sessions this week!" but a quiet line that, if it climbs, prompts *you* to ask
whether it's crowding out sleep, play, reading, or fishing. The success state is
steady moderate use, not growth.

Build a single explicit alarm: if a child's weekly sessions exceed a
pre-set ceiling (default: 2/day averaged over a week, per `motivation.md` §4's
cap logic), the parent view says so — once, calmly — and suggests looking at
whether this is still healthy. No streak-breaking, no guilt; a smoke detector,
not a scold.

### 5.3 What it must never become

Do not let this metric acquire a target, a goal, or an optimisation. It exists to
be *watched*, and the only correct response to it climbing is a human judgement at
a table, never an automated intervention. It is the one measurement in the entire
system whose purpose is to sometimes tell you to have the child stop.

---

## 6. Pre-registration additions

Register these before the analyses run (extend `evidence-and-theses.md` §3's
`prereg` table):

- **T7 (staggered baseline).** Practice-window probe slope exceeds baseline-window
  slope, per child, pooled. Threshold: positive contrast, ≥2 baseline points.
- **T8 (crossover).** Trained-family probe subscore rises more than untrained-family
  subscore in the same child-window. Threshold: positive within-child difference,
  clean-control families only (§3.3).
- **T9 (dose-response).** Probe gain increases with practice dose, and dose predicts
  gain better than elapsed calendar time. Threshold: positive dose slope,
  outperforming the time-only model.

Each must be able to fail. T9 fails if gain is flat across doses or explained by
time alone. T8 fails if untrained families rise as fast as trained ones (which
would suggest general test-familiarity, not learning). Register the failure
conditions as explicitly as the success ones.

---

## 7. What this does and does not license

**Licenses:** "Probe improvement tracks practice in a dose-dependent, skill-specific
way that begins when practice begins — three internal controls that maturation and
schooling cannot jointly explain." That is a strong, honest, quasi-experimental
claim, and it is enough to bring a researcher a real study rather than a pitch.

**Does not license:** any between-approach claim (no comparison arm), any
population-level generalisation (no representative sample), the word "randomised,"
the word "controlled" without "quasi-," or a causal claim from any one of the three
designs alone. `evidence-and-theses.md` §5's limits still bind, extended:
triangulated quasi-experimental evidence is not an RCT, and calling it one forfeits
the credibility the honesty bought.

The comparison you *can't* run — celerant vs Khan vs a teacher — is deliberately
left for a collaborator with a classroom and an IRB. Your job is the clean
instrument and the honest internal controls; theirs is the population and the
randomisation. Publishing the probe and the pre-registrations openly is what hands
them a study they can actually run.

---

## 8. Acceptance

- All analyses are offline readers: a test greps the selector, θ update, unlock
  gate, and `replay()` and fails if any references `probe`, `prereg`, or the new
  analysis outputs.
- Dropping every analysis output changes no θ, no rate, no unlock.
- The staggered-baseline "before meaningful practice" cutoff is computed from
  ledger practice volume, never by withholding practice from a child.
- Untrained-family controls are flagged for component leakage (§3.3); the report
  distinguishes clean controls from shared-component ones.
- Dose-response is always reported beside the calendar-time-only model, never alone.
- The displacement metric (§5) has no target, no goal, no optimisation path, and
  its only automated output is a single calm ceiling alarm. Assert there is no code
  that maximises any §5 quantity.
- Every new thesis (T7–T9) has a `prereg` row with success *and* failure conditions,
  registered before the first resolving datum.

---

## 9. Order of work

1. **Dose-response (§4).** Simplest, needs no baseline, works with the data you
   have today, and produces the single most legible figure. Build first.
2. **The displacement metric (§5).** Build it early precisely because it protects
   the children while you're still watching closely — do not defer the safeguard
   until after you've scaled.
3. **Staggered baseline (§2)** and **crossover (§3)** as probe history accrues;
   both need several administrations before they say anything.
4. Register T7–T9 now, ahead of the data, per §6.

The evidence layer, like the probe and the feature tags before it, is cheapest to
build before the population arrives and most regretted if deferred — with the added
reason here that §5 is a safeguard, and a safeguard built after the harm it guards
against is not a safeguard.
