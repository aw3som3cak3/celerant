# Build brief: adaptive arithmetic & algebra trainer

You are building a small, self-hosted web application that presents one math
problem at a time to a child, accepts a typed answer, and adapts difficulty to
that child. It is for the author's own children, running on a home server. It
will never be sold, never have users it does not know by name, and never need
a marketing page.

Read this whole brief before writing code. Ask about anything genuinely
ambiguous. Do not ask permission to begin.

---

## 1. The single screen

The entire product, in the child's view:

```
                    3x + 7 = 22

                    x = [    ]
```

That is all. No score, no timer, no streak, no medal, no avatar, no confetti,
no sound, no progress bar, no "You're on fire!". A faint eight-tick level
indicator at the bottom edge is the maximum permitted ornament.

The child solves on paper. The screen accepts the result.

**Feedback:** correct → a quiet word, next problem after ~800ms. Wrong → one
retry. Wrong twice → the worked solution appears, line by line, then a
`Next` button the child presses when ready. There is no penalty state and no
tone of disappointment anywhere in the copy.

**There is no clock.** Never time the child, never display elapsed time, never
rank by speed. Response latency may be *recorded* for the model; it must never
be *shown*. Timed drill induces math anxiety, and math anxiety consumes the
working memory that arithmetic requires. This constraint is not negotiable and
must not be "improved" in a later phase.

---

## 2. Why it works this way

These are load-bearing. If a design decision conflicts with one of these,
the design decision loses.

- **Fluency exists to free working memory.** A child who spends attention on
  7×8 has none left for the equation containing it. Arithmetic automaticity is
  a prerequisite for algebra, not a parallel track. The skill graph must
  enforce this.
- **Worked examples beat discovery for novices.** Hence the solution reveal on
  the second miss. The failure path is where instruction is delivered.
- **Interleaving beats blocking.** Mixed problem types teach *selection* of a
  method. Never serve the same skill twice in a row if an alternative is
  eligible.
- **Spacing beats massing.** A skill practised to mastery must return days
  later, before it decays.
- **Retrieval, not recognition.** Always a free-text answer. Never multiple
  choice.
- **Extrinsic reward corrupts.** Points and medals shift the goal from solving
  to collecting. This is why the screen is empty.

---

## 3. Architecture

Node + TypeScript. Server-authoritative.

```
fastify              http
better-sqlite3       one file on disk; back it up with cp
zod                  validate skill params and request bodies
vitest               tests
```

No ORM. No React Router. No auth provider. A child logs in by clicking their
name and typing a 4-digit PIN; the parent account is the same table with a
flag. Sessions are a signed cookie.

**Problems are generated, never stored.** A skill is a template plus a
parameter draw. Nomp reaches effectively unlimited variation from ~1600 such
algorithms; you need roughly 80.

**Generation and grading happen on the server.** The client receives a prompt
string and an item id. It never receives the answer. If the answer is in the
page source, it will be found.

### Tables

> **Superseded by `handoff.md` §1 and `ui-lifecycle.md` §2.** There is no
> `beta`. There is also no `child` or `skill` table: identity is `family` (an
> icon pair) + `player` (an icon); skills live in code. `attempt`, `sprint`,
> `tool_rate` are append-only **ledgers**; `ability` is a **cache** rebuilt by
> `replay()`, keyed `(player_id, skill_code)` with `rate` + `rate_state`. A
> `session` authorises a family, never a player. See `ui-lifecycle.md` §2 for
> the authoritative schema.

```sql
child     (id, name, pin_hash, birth_year, is_parent, created_at)
skill     (id, code, family, year, mode)         -- static metadata; no beta
ability   (child_id, skill_id, theta, n_obs, last_seen_at, rate, rate_source,
           PRIMARY KEY(child_id, skill_id))
attempt   (id, child_id, skill_id, item_json, given, correct, tries, latency_ms, at)
```

`attempt` is append-only. It is the only thing that matters if everything
else is lost; every θ can be replayed from it (there is no β). Never delete rows.

---

## 4. The skill graph

> **Superseded by `handoff.md` §3.** The graph is delivered whole in
> `src/skills.ts` (77 skills). Each skill carries `year` and `mode` in place of
> `betaPrior`; answers are exact (`int` or reduced `frac`), never decimal.

```ts
type Skill = {
  code: string;                      // "mult_table_7", "lin_ax_plus_b"
  family: string;                    // "multiplication", "linear"
  year: number;                      // Lgr22 school year; the only difficulty knob
  mode: "component" | "compound";    // only components may be sprinted
  requires: string[];                // codes that must be at theta >= 0 (transitive)
  generate(r: Rng): {
    prompt: string;                  // "7 × 8 ="   |   "3x + 7 = 22"
    answer: Answer;                  // { int } or reduced { frac }; never decimal
    steps: string[];                 // shown on second miss
  };
};
```

Build the graph in this order. Each tier gates the next through `requires`.

1. **Number bonds to 10, then 20.** Addition and subtraction within 20.
2. **Place value.** Two- and three-digit addition and subtraction, with and
   without carrying, as separate skills — carrying is a distinct competence.
3. **Multiplication tables 2–12.** One skill per table. Then a mixed skill.
4. **Division as inverse.** `56 / 7`, exact only.
5. **Order of operations.** Two operations, then parentheses.
6. **Negative integers.** Addition, then subtraction, then multiplication.
7. **Fractions.** Equivalence, then addition with common denominators, then
   unlike. (Answers as `a/b` string; extend the grader.)
8. **Linear equations.** In the sequence: `x+a=b`, `x−a=b`, `ax=b`, `x/a=b`,
   `ax+b=c`, `a(x+b)=c`, `ax+b=cx+d`, `a(x+b)=cx+d`.

Answers are integers until fractions arrive. Never generate an equation whose
solution is a decimal. Negative solutions are fine and should appear early in
tier 8.

`steps` must be genuine intermediate lines, not a restatement. For
`3x + 7 = 22`: `["3x = 22 − 7", "3x = 15", "x = 5"]`.

---

## 5. The model

An online Elo / one-parameter IRT scheme. This is the Klinkenberg & Maris
system behind Math Garden (Rekentuin); Pelánek's group at Masaryk has
published the useful variants. **Do not train anything. Do not fetch a
dataset. Do not import a machine learning library.** The whole model is:

> **Superseded by `handoff.md` §1: there is no `beta`.** β aggregates evidence
> across children, and this house has two — it would never converge, only
> drift, silently making θ non-comparable across time. So the model is θ alone:

```ts
const p = 1 / (1 + Math.exp(-theta));   // predicted P(correct); beta is gone
const k = 1 / (1 + 0.05 * childObs);
theta += k * (correct - p);
```

K decays with observation count: plastic when ignorant, stable when informed.
The θ seed starts `n_obs` at 2 (a rumour, not a measurement). Update on **first
attempt only** — a retry after a miss is not independent evidence.

Grading of the update, not just the answer:

| outcome              | `correct` |
|----------------------|-----------|
| right, first try     | 1.0       |
| right, second try    | *no update* |
| wrong twice          | 0.0       |
| "I don't know"       | 0.0, but with `kChild` halved |

**Cold start.** Seed θ per skill from the child's school year, not from zero.
With β gone, the seed is `clamp(1.4 + 0.8 × (δ − 1), −2.0, 3.0)` where
`δ = childYear − skill.year`, `n_obs = 2`. It anchors the child's *previous*
year at the 0.80 target (δ=1 → p≈0.80), their current year at p≈0.65, and
years further back progressively higher — so the nearest-to-target skill is
last-year's content, not the most-clamped one. (The earlier `0.6·δ` anchor,
clamped `[−1.5, 1.0]`, put every skill two-plus years back at p≈0.73 — nearer
0.80 than the child's own year — so a competent ten-year-old opened on number
bonds.) Three or four real attempts erase the seed.

---

## 6. Item selection

This is where the pedagogy lives. Chess Elo pairs at p ≈ 0.5. **Do not.**

Score every eligible skill and take the max:

```
eligible = unlocked (all `requires` satisfied) AND not the immediately previous skill

score(s) = -|p(theta_s) - 0.80|              // p = 1/(1+e^-theta); target 80%, not 50%
         + 0.35 * decay(s)                    // spacing: overdue skills surface
         - 0.50 * recency(s)                  // interleaving: 3-back penalty
         + 0.05 * rng()                       // break ties, avoid ruts
```

A bounded **introduction** slot supplements this: the argmax alone never serves
a freshly-unlocked skill seeded far below 0.80, stranding a placed child at
their frontier. So a small fraction of items, taken only when the child is
coasting, serve the neglected frontier directly (misses land on the worked
solution, where instruction belongs). The 0.80 target itself is unchanged.

- `decay(s)` rises with days since `last_seen_at`, scaled by how well the skill
  was known — a strong skill decays slowly. Duolingo's half-life regression
  paper (Settles & Meeder, 2016) is the readable treatment; take the shape of
  the curve, not the constants.
- `recency(s)` is 1.0 if the skill appeared in the last 3 items, tapering to 0
  by 8.
- A skill unlocks when every `requires` entry (checked transitively) has
  `theta >= 0` — predicted success ≥ 50% — and, if a component, is fluent
  (addendum §7). `theta >= beta` collapses to `theta >= 0` now that β is gone.

Log the score vector for every selection into `attempt.item_json`. When the
selector misbehaves — it will — you need to see why it chose what it chose.

---

## 7. The escape hatch

There must be an **"I don't know"** button, always, next to the input.

Without it a stuck child guesses. A guess poisons θ worse than an honest
wrong answer, because it is uncorrelated with ability. Pressing it goes
straight to the worked solution with no retry and no shame in the copy. The
copy for it is `I don't know yet`.

---

## 8. Parent view

A separate route, PIN-gated, deliberately dull.

- Per-skill θ (there is no β; θ ≥ 0 means unlocked-accurate), as a plain table.
  No dashboard, no gauge, no charts. Handoff §7 adds two raw diagnostic columns
  — recent first-try accuracy and attempt count — to catch a broken graph.
- Attempts over the last 7 days, count only.
- **Do not show accuracy percentage.** The system targets 80% by design; a
  parent seeing "80%" will read it as a B− and intervene.
- No comparison between siblings. Ever. Do not build the query.

There is nothing here to check daily. Say so on the page.

---

## 9. Build order

Ship each phase working before starting the next. A phase is done when the
child can use it.

1. **Skeleton.** fastify + sqlite + the four tables. One hardcoded skill
   (`mult_table_7`). The screen. Server-side generate and grade. No accounts.
2. **The model.** Elo update, `ability` table, cold start seeding. Verify with
   a simulation: 500 synthetic children of known true ability, check θ
   converges and that mean success rate lands near 0.80.
3. **The graph.** Tiers 1–4. Prerequisites and unlocking. The selector with
   interleaving.
4. **Spacing.** Decay, `last_seen_at`, the overdue term.
5. **Accounts.** Names, PINs, sessions. Parent view.
6. **Tiers 5–8.** Negatives, order of operations, fractions, linear equations.
   Fractions require extending the answer grader; do that first.

---

## 10. Non-goals

> **Refined by `docs/motivation.md`.** The blanket "nothing motivational may
> exist" is replaced by a sharper rule: **no reward may be contingent on
> answering correctly** (it would corrupt θ). Points, XP, badges, streaks,
> coins, leaderboards, and any reward on the practice screen remain forbidden.
> What is now permitted, all strictly downstream of the model: a session counted
> in items (with an on-screen items-remaining counter), a start-of-session choice
> of *skill* (never difficulty), a peak-end last item, a silent **card** shelf
> (evidence, not verdicts), and a cooperative **family goal** in sessions with no
> per-child contribution. See `motivation.md` for why each obvious version is
> forbidden.

Say no to all of these, including when a future version of me suggests them.

- Points, XP, badges, streaks, medals, coins, leaderboards, avatars.
- Timers, speed scores, "fastest solve", any display of latency.
- Multiple choice. Anywhere.
- Sound effects, animation beyond a 200ms opacity transition.
- Any LLM in the request path. Problems are generated by template. Solutions
  are written by the skill author. Nothing is inferred at runtime.
- Push notifications, email, reminders, "you haven't practised in 3 days".
- Accounts for anyone outside this house.
- A mobile app. It runs in a browser on a laptop, next to a notebook.

---

## 11. Acceptance

- A child can solve 20 problems without seeing a single number that isn't part
  of a problem — **except** the items-remaining session counter, the one number
  `motivation.md` §3.1 permits (and 20 problems is now exactly one session).
- The simulation in phase 2 shows mean first-try accuracy in [0.75, 0.85].
- No two consecutive items share a skill code, across 1000 simulated draws.
- A skill unpractised for 14 days reappears within the next 30 items.
- `curl` on the item endpoint returns no answer field. Verify by reading the
  response, not by reading the code.
- Deleting `ability` and replaying `attempt` reproduces every θ exactly.
