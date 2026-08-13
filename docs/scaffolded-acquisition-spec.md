# Scaffolded acquisition — teaching a fact in-app, not routing to a grownup

Status: SPEC (2026-08-13). First slice: multiplication derived facts (sushi's 3/4/6/8× gap
is the first real case). Self-contained for a fresh builder.

## 0. The problem, and the principle it forces

celerant today does two things well: **practice** (spaced retrieval) and **fluency**
(building speed once a fact is accurate). It assumes the first encoding already happened.
It doesn't. When a child meets a fact she never learned (sushi + `mult_table_6`), the
current loop offers only: fail → "vet inte" → a single flashed reveal (`status:'revealed'`,
`it.steps`) → the selector's ~80%-success target routes *around* the skill (θ drops, out of
band). She never learns it in-app; the only real teaching path is "a grownup explains the
strategy." Grownups are the **scarcest resource in the system** — that introduces latency and
a dependency we must design away.

**THE PRINCIPLE (make it first-class — see the memory note `scaffolded-acquisition`):**
*Teach, don't just test.* When the data shows a fact is **unlearned but derivable** — the
child fails/idk's it, yet the sub-facts a known strategy needs are already fluent — the engine
must **teach it in-app via a self-fading scaffold**, not route around it and not defer to a
grownup. This is the symmetric partner of cross-subject gating: that principle says *don't
serve what's blocked*; this one says *don't avoid what's ready-but-unlearned — scaffold it.*
The grownup-alert path survives only as the **rare fallback** (a fact that won't yield to
scaffolding, or a child stuck even with it), never the front line.

This is not foreign to celerant — it already scaffolds acquisition at the **number-sense
floor** (the pictorial tier-0 rungs, the GROUND combine/separate phase: teach, don't just
test). This slice extends the same idea *up* to symbolic fact acquisition.

## 1. The pedagogy (why derived facts make a self-teaching puzzle)

A derived-fact strategy **decomposes a fact the child can't do into steps she can** — so she
*derives* the answer through her own successful computation. That buys three research-backed
wins at once:

- **Generation effect** — a self-produced answer encodes far better than a passively-read one.
  She *builds* 42, she doesn't read it.
- **Success all the way down** — every sub-step is something she's fluent on, so acquisition
  feels like solving a puzzle, not failing a test (the motivation guardrail: witness success,
  never hand a wall).
- **Faded worked examples → completion → problem** (Sweller/Renkl): start fully worked, fade
  the scaffold, end at the bare fact. That fade *is* celerant's accuracy→fluency arc.

Worked example for `6 × 7`:
```
5 × 7 = ?     → 35     (she's fluent on ×5)
35 + 7 = ?    → 42     (she can add)
so 6 × 7 = ?  → 42     (she just built it)
```

## 2. The data trigger — when acquisition fires (no grownup in the loop)

For a picked skill `S` with a defined derivation `D(S)` (§4), acquisition applies when ALL hold:

1. **Not graduated** — the child has not yet cleared the bare rung (per-child fade state, §5).
2. **Derivation inputs are fluent** — every skill in `D(S).inputs` is `componentFluent`
   (selector.ts:80). This is the readiness check: she can do the sub-steps. If an input is
   *not* fluent, acquisition does NOT fire — the child isn't ready to derive it yet; the
   selector should drop lower instead (serve the missing input). This is what makes the
   multiplication factory's shallow `requires:["mult_table_2"]` (skills.ts:498) *correct*: the
   graph unlocks the table early, and acquisition — not a deeper `requires` chain — decides
   whether to teach or test.
3. **The bare fact is unlearned** — low θ / `rate.source==='unknown'` / a recent miss-or-idk on
   `S`. (The first miss/idk on a fresh table is the natural ignition.)

All three are read from data the child already generates. No parent decides.

## 3. The item kind — a faded, self-teaching scaffold

An **acquisition item** is one pedagogical unit: a faded worked-derivation of a *specific*
instance (`6 × 7`), served through the existing `InputStage` (reuse `promptOverride` /
`promptNode` — it already renders arbitrary prompts on the same numpad + clock). Fade level is
tracked per **(child, skill)** — the strategy generalizes across the whole table, so the level
is on `mult_table_6`, not on `6×7` vs `6×8`.

Fade schedule (per skill):

| Level | What's shown for `6 × 7`                         | Child supplies |
|-------|--------------------------------------------------|----------------|
| L0 full     | `5 × 7 = ?` → `35 + 7 = ?` → `6 × 7 = ?`    | each sub-step, then the target |
| L1 partial  | `6 × 7 = 35 + ?`                            | the final add |
| L2 cued     | `6 × 7 = ?`  *(tip: 5×7, and one more 7)*   | the bare fact, hint present |
| L3 bare     | `6 × 7 = ?`                                 | = the normal retrieval rung |

- **Advance** a level when the child answers the current level's *target* first-try correct
  (a couple of clean successes at a level, to be tuned).
- **Drop back** one level on a miss/idk — never below L0. Failing means the scaffold was too
  thin, not that she's incapable.
- **L3 reached and held** = graduation (§6): hand the skill to the normal fluency machinery.

## 4. The derivations (content, multiplication first)

A small per-table metadata table. Each derivation names its **inputs** (for the §2 trigger),
and the **sub-steps** the scaffold renders. All inputs are *easier* tables the child likely
owns (×2, ×5, ×10). `b` is the multiplier for the instance (the factory's `r.int(2,12)`).

| Table | Strategy                | Inputs                     | Sub-steps for `t × b` |
|-------|-------------------------|----------------------------|------------------------|
| ×3    | ×2 + one group          | `mult_table_2`             | `2×b`, `+b`            |
| ×4    | double ×2               | `mult_table_2`             | `2×b`, `×2`            |
| ×6    | ×5 + one group          | `mult_table_5`             | `5×b`, `+b`            |
| ×7    | ×5 + ×2                 | `mult_table_5,2`           | `5×b`, `2×b`, `+`      |
| ×8    | double ×4               | `mult_table_4`             | `4×b`, `×2`            |
| ×9    | ×10 − one group         | `mult_table_10`            | `10×b`, `−b`           |
| ×11   | ×10 + one group         | `mult_table_10`            | `10×b`, `+b`           |
| ×12   | ×10 + ×2                | `mult_table_10,2`          | `10×b`, `2×b`, `+`     |

Pick the strategy whose inputs are fluent for *this* child (×8 can derive from ×4 or, if ×4
isn't fluent yet, double-double from ×2 — prefer the shallowest fluent path). Later slices:
bridging-through-10 addition/subtraction (same shape). Spelling/language acquisition is a
DIFFERENT design — out of scope here (don't promise it in this slice).

## 5. Engine integration (keep the selector subject-blind; A11 intact)

Acquisition is a **generation-layer** decision, not a selection-layer one — the selector/θ/gate
stay unchanged. After the selector picks `S` (pickNext), the generation step
(`nextItem`/`issueNext`) asks `acquisitionApplies(player, S)` (§2) and, if true, emits the
scaffold variant at the child's current fade level instead of the bare item.

- **Ledger**: acquisition attempts are recorded but flagged (mirror `attempt.warmup`, schema
  `attempt.warmup`, repo `AppendAttempt.warmup`) — a new flag or a reuse — so replay
  reconstructs them and the clean analyses can exclude them.
- **θ**: an acquisition success updates accuracy *weakly and upward* (like warmup) so the skill
  **stays in-band and keeps getting picked** (a scaffold she wins pulls θ up, not down — this is
  what stops the selector avoiding a ready-but-unlearned fact). A scaffold miss just drops the
  fade level; it must not crater θ.
- **NEVER a fluency/rate measure**: a scaffolded latency is meaningless for speed (she's
  deriving). Acquisition items are excluded from the `sprint`/`tool_rate`/rate path exactly as
  warmup is — the fluency number stays honest.
- **Selection eligibility (the one real touch)**: an acquisition-eligible skill (§2) must remain
  *selectable* even if its bare-fact θ sits below the normal band, because it will be served as a
  winnable scaffold, not a failing bare item. Implement as: `acquisitionApplies` skills keep
  eligibility (or a gentle acquisition priority). This is the principle made mechanical — don't
  route around ready-but-unlearned; teach it.
- **Rendering**: L0 walks 2–3 `InputStage` prompts in sequence (one unit, one advance on the
  final target); L1/L2 are single prompts with the partial/hinted string; L3 is the ordinary
  item. No new pad — reuse `InputStage`.
- **State**: a small append-only/last-writer table `acquisition_state(player_id, skill_code,
  fade_level, updated_at)`, replayable, model-invisible to fluency. (Pattern precedent:
  `burst_run`.)

## 6. Graduation → the existing fluency rung

When the child answers the **bare** fact (L3) first-try correct enough to hold the level, the
skill graduates: acquisition stops firing (`acquisitionApplies`→false via the not-graduated
clause), and the skill is now just a normal rung the existing selector + fluency + burst
machinery own. Acquisition is the missing *first-encoding* layer under fluency, nothing more —
it hands off cleanly and disappears.

## 7. First slice & the fallback

- **Build**: multiplication derived facts, tables ×3/×4/×6/×7/×8 first (sushi's exact gap), the
  fade schedule, the trigger, the `acquisition_state` table, the ledger flag, the sequenced
  `InputStage` rendering, and the eligibility touch. Verify on sushi's real ×6/×8 idk pattern.
- **Fallback (the exception, not the front line)**: if a fact won't yield (child misses even L0
  repeatedly — an input she was thought fluent on isn't really there), THEN raise the
  grownup alert with the specific strategy + instructions. Latency minimized, grownup not
  eliminated. Keep the alert's copy ready (the derived-fact strategy in plain parent-language).

## 8. Invariants / guardrails

1. **The fluency number stays honest** — acquisition never writes a rate; it's warmup-class for
   the rate path. (Ties to the aim-calibration work: a scaffolded latency must never pollute the
   normative aim.)
2. **Motivation** — acquisition must feel like winning. Every level is answerable from fluent
   inputs; a miss softens the scaffold (drop a level), never punishes. No stopwatch, no bonus,
   no comparison — the motivation guardrails apply unchanged.
3. **Readiness is real** — acquisition fires ONLY when the derivation inputs are truly fluent
   (`componentFluent`), so we never "teach" a strategy on sub-facts she doesn't have. If inputs
   aren't fluent, go lower — that's the graph's job, not a scaffold's.
4. **Selector stays subject-blind / A11** — the decision lives in generation + a narrow
   eligibility touch, not in θ or the gate.

## 9. Open questions for the builder

- Exact success counts to advance/drop a fade level (start: 2 clean to advance, 1 miss to drop).
- Choosing the derivation path when multiple inputs are fluent (prefer fewest sub-steps).
- Whether L0's sub-steps count as their own (weak) practice for the input skills, or are inert.
- Ignition timing: fire acquisition on the *first* miss/idk of a ready fact, or after two, to
  avoid scaffolding a careless slip.
