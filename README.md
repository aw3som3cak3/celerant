# Celerant

A small, self-hosted adaptive arithmetic & algebra trainer for one family.
Presents one problem at a time, accepts a typed answer, and adapts to each
child with an online Elo scheme on a single quantity — the child's ability θ
per skill. **There is no difficulty parameter (β):** difficulty is the shape of
the skill graph, not a number attached to a problem. It layers the Morningside
fluency model on top: components can be sprinted (timed), and a compound only
unlocks once its component prerequisites are *fast*, not merely correct.

Built from `docs/agent-brief.md`, `docs/fluency-addendum.md`, and
`docs/handoff.md` — read them in that order; the handoff supersedes parts of the
first two (β is gone; the 77-skill graph is delivered whole). They are the
specification and the source of every design decision here.

## Stack

- **Next.js (App Router) + TypeScript** — one deviation from the brief, which
  specified Fastify. The request was a Next.js project, so Next route handlers
  (Node runtime) stand in for Fastify. Every load-bearing constraint is
  preserved: server-authoritative generation and grading, the answer never
  reaches the client, append-only SQLite, no LLM in the request path.
- **better-sqlite3** — one file on disk at `data/celerant.db`. Back it up with
  `cp`. (v12 is used because it ships a prebuilt binary for Node 24.)
- **zod** — request-body validation.
- **vitest** — tests.

## Run

```bash
npm install
cp .env.example .env.local     # (SESSION_SECRET is unused now; harmless)
npm run dev                    # http://localhost:3000
```

First launch is empty, so the first screen **creates a family**: pick two icons
(the family is the *pair* — "räven och varmkorven"), set an entry PIN and a
parent PIN, then create a player (one icon + årskurs F–9). You land on the
**first problem immediately** — there is no name, no email, no timed test on the
way in. Returning: pick the family's icons, type the entry PIN, tap a player.

```bash
npm test          # 106 checks incl. verify (80), icons, replay idempotency
npm run build     # typecheck + production build
npm run start     # production server
```

## Deploy (Fly.io — push-to-deploy, data on a persistent volume)

The app is one SQLite file on disk, so it needs a host with a real disk — not a
serverless platform (Vercel/Netlify have no persistent filesystem, so the DB
would reset on every cold start). Fly.io (or Railway, or any VPS) gives a mounted
volume and push-to-deploy. SQLite in-process is the *fast* choice here: no
network hop per query, and the write path is O(1) incremental.

Files: `Dockerfile` (validated — builds, serves, and persists across restarts),
`fly.toml`, and a `deploy` job in `.github/workflows/ci.yml`.

One-time setup (the app name in `fly.toml` is `celerant-obitz`):

```bash
fly auth login
fly apps create celerant-obitz
fly volumes create celerant_data --region arn --size 1 -a celerant-obitz

# First deploy, then pin to a SINGLE machine — SQLite has one writer.
fly deploy -a celerant-obitz
fly scale count 1 -a celerant-obitz

# A deploy token for CI, stored as the GitHub secret FLY_API_TOKEN:
fly tokens create deploy
gh secret set FLY_API_TOKEN        # paste the token when prompted
```

After that, every push to `main` runs the workflow: **build + test**, and only
if green, **deploy**. PRs build and test but never deploy. No `SESSION_SECRET`
is needed (sessions are token-hashed). Back up by copying `celerant.db` off the
volume, or `GET /api/family/export` per family (§8.2).

> One caveat to keep in mind: this puts the ledger on a Fly machine you rent, not
> literally in the house. That's a small step away from the brief's "never leaves
> the house" property. Fully self-hosting (a home server + a tunnel, or a
> self-hosted Actions runner) keeps that property; the same Docker image runs
> there unchanged.

## What the code is

| Area | Files |
|------|-------|
| `replay()` — rebuilds the ability cache from the ledgers | `src/db/replay.ts` |
| Ledger/cache schema (family, player, attempt/sprint/tool_rate, ability) | `src/db/schema.sql`, `src/db/repo.ts` |
| Model (Elo on θ, no β) | `src/model/*` |
| Skill graph — 77 skills, delivered whole | `src/skills.ts` |
| Icons — 186, families are pairs | `src/icons.ts` |
| Property suites (ported from `docs/`) | `test/verify.test.ts`, `test/icons.check.test.ts` |
| Item selection (80% target, interleaving, spacing, introduction) | `src/lib/selector.ts` |
| Practice / sprint / fluency | `src/lib/practice.ts`, `src/lib/sprint.ts`, `src/lib/fluency.ts` |
| Sessions (family-scoped) + PINs | `src/lib/session.ts`, `src/lib/auth.ts` |
| API routes | `src/app/api/**` |
| Screens | `src/app/{page,practice,sprint,warmup,parent}` |

## Design decisions worth knowing

- **Ledgers vs cache — the one rule.** `attempt`, `sprint`, `tool_rate` are
  append-only ledgers (mutable only by a `voided_at` tombstone or a change of
  owner). `ability` is a **cache**, rebuilt from the ledgers by `replay()`. The
  answer path updates the cache **incrementally** (attempts touch only θ, sprints
  only rate, both in `at` order, so the fold lands exactly where a replay
  would); a **full `replay()` runs only on invalidation** — void, reassign,
  årskurs change, a new tool-rate. The equality test guards the fast path
  byte-for-byte. Wrong child? Reassign the id range, replay. Årskurs wrong?
  Re-seed, replay. Generator bug? Void the range, replay — and θ correctly
  falls back to its seed.

- **Per-skill sharpness — RD and idle decay (Glicko-2, one-sided).** θ carries a
  rating deviation (`rd`) and `volatility` (`src/model/elo.ts`). Only the child's
  numbers move, against the skill's *fixed* tier difficulty (opponent rating 0,
  so g = 1 and E = σ(θ) = `predict(θ)` — no bias, aligned with the 0.80 target).
  RD replaces the old `k = 1/(1+0.05n)`: it **shrinks with practice and grows on
  idle**, so a skill unpractised for weeks becomes uncertain again and its next
  answer counts more. Δθ ∝ rd'² is itself the slip floor — a careless miss on a
  mastered skill barely moves θ. Volatility complements the sprint rate in the
  fluency gate (an erratic skill isn't "fluent" even at target accuracy). Problem
  types are **not** rated (that was β). **τ = 0.5, the idle coefficient, and the
  volatility gate are GUESSES** (instrumentation.md §3): re-run the phase-2
  simulation (`test/pure.test.ts`) whenever any of them changes.

- **Identity is icons, never names.** A family is an unordered **pair** of icons
  (186 icons → 17,205 families); a player is a single icon within their family.
  The child logs in on a grid — there is no text field on a child's screen
  except the answer to a maths problem. The system never learns a child's name.

- **A session authorises a family, never a player.** `player_id` is a parameter
  on every request, asserted against the session's family — so two children on
  two tablets under one cookie never race. The device cache holds `family_id`
  and nothing else.

- **The answer is never sent to the client.** `/api/next` returns only
  `{ itemId, prompt, family, mode, level }`. Item generation writes nothing;
  the answer is stashed in-memory keyed by an opaque id and revealed only after
  a miss. Verified by reading the response.

- **No β.** The model is θ alone; `p = 1/(1+e^−θ)` and a skill is
  "accurate" at `θ ≥ 0`. β aggregated evidence across children, and with two
  children it would only drift — so difficulty is encoded as graph structure
  instead (`src/skills.ts`, one skill per cognitive *seam*). θ is seeded from
  the child's school year — `clamp(1.4 + 0.8·(δ−1), −2.0, 3.0)`, `δ = childYear −
  skill.year`, `n_obs = 2`. The anchor puts the child's *previous* year at the
  0.80 target (δ=1 → p≈0.80) rather than below it, so a competent ten-year-old
  opens on last-year's content, not number bonds; a few real attempts erase the
  seed. The fluency gate compares with an epsilon, so a provisional rate seeded
  at the aim never flips on float equality.

- **The model updates on the first attempt only**, following the grading table
  (right-first → 1.0; right-second → no update; wrong-twice → 0.0; "I don't
  know" → 0.0 with `k` halved). The decision lives in one pure function
  (`updateDecision`) shared by the live path and by replay, so deleting
  `ability` and replaying `attempt` reproduces every θ exactly (tested).

- **Unlock is transitive**, accuracy-gated (`θ ≥ 0`) and fluency-gated. A skill
  unlocks only when every prerequisite is itself unlocked **and** accurate
  **and** — if a component — fluent (a direct-only check let `(8 + 5) × 5`
  unlock before the simpler `3 + 4 × 2`).

- **Fluency is three-valued, not a boolean.** A rate is `measured` (a sprint
  exists), `provisional` (seeded), or `unknown`. `unknown` must never silently
  pass or fail the gate — if the selector reaches one, the code asserts.

- **Placement is not a gate** (ui-lifecycle §4.5, correcting the earlier
  placement feedback). Provisional rates seeded from årskurs already satisfy the
  fluency gate — that was the point of making the rate three-valued — so the
  child's first screen is a **problem**, not a timed writing test. The aim
  before any measurement comes from a per-årskurs default ceiling; one real
  sprint overwrites it outright. Writing-speed measurement runs only when a
  child opts into sprint mode (and may never happen); test-down placement is a
  parent action for a misplaced child, coarsely covered by changing årskurs
  (which re-seeds and replays). Do **not** lower `AIM_BASE_FRACTION` to make a
  child progress — the lever is the missing-evidence semantics, not the aim.

- **Frontier introduction.** A strict 0.80 argmax never serves a freshly-
  unlocked skill seeded far below target, stranding a placed child at their
  frontier. A small, bounded fraction of items — taken only when the child is
  coasting — serves the neglected frontier directly; misses land on the
  worked-solution reveal, where instruction for a new skill belongs. The 0.80
  target and the aim are untouched.

- **No clock on a compound, ever.** Sprint mode exists only for components;
  there is no code path that times a compound. Latency is recorded on every
  attempt for the application log (addendum §6) but is never shown.

- **The parent view is deliberately dull**, behind its own PIN, and shows no
  comparison between siblings — one player id, never a join. The graph
  diagnostics (handoff §7) **fire, they don't display**: the view shows a
  sentence only when a skill trips a threshold (accuracy collapses right after
  unlock → missing prerequisite; ~100% forever with θ unbounded → year too
  high), and nothing on a healthy child. An empty parent view is the normal one.
  A table of accuracy percentages is a report card however it is framed. The
  celeration chart belongs to the child and does not appear here.

- **The motivation layer (`docs/motivation.md`) is strictly downstream.**
  `replay()` never reads its tables; dropping every `card` / `session_run` /
  `family_goal` row changes no θ, rate, or unlock (tested). The one hard rule:
  **no reward is ever contingent on answering correctly** — that would make the
  child solve "maximise corrects" (guess instead of *vet inte*, avoid the edge
  of competence) and poison θ. So there are no points, XP, streaks, or badges.
  What exists instead: a **session** is 20 items (not minutes — *vet inte*
  counts; the only number on the practice screen is items-remaining); the child
  **chooses one of three skills** at the start, labelled by content never by
  difficulty; **item 20 is the highest-p eligible skill** (peak-end, so a
  session never ends in failure); a **card** — the first problem of each kind
  the child ever solved, their own answer, the date — accretes on a silent
  shelf (evidence, not a verdict; ungameable, no hierarchy); and a cooperative
  **family goal** counted in sessions, family-wide, with no per-child
  contribution stored or queryable. A child-only `svårare` toggle shifts the
  target to p=0.65, unrewarded.

- **Relatedness — a parent at the table (`motivation.md` §3.6).** Beilock found
  math-anxious parents who *helped* made their children worse across a year;
  parents who didn't help had no such effect. The fix is not distance — it is
  the parent doing *their own* untimed session in the next tab, at the same
  table. A parent is just a player; give yourself an icon. Your own work is
  worth more than any encouragement, and never say *you're clever* — say *you
  worked that out*.

## Deviations and what's deferred

- **argon2id → scrypt.** The spec asks for argon2id; it needs a native build
  this environment has no toolchain for (same reason better-sqlite3 is pinned to
  the prebuilt v12). PINs use Node's built-in scrypt, a memory-hard KDF in the
  standard library. Swappable in `src/lib/session.ts`.
- **CLDR reconciliation deferred.** ui-lifecycle §3.2 asks that icon `name`/
  `keywords` be reconciled against Unicode CLDR (`sv.xml`). That needs a large
  external fetch; the delivered hand-written Swedish keywords are kept (parent
  search works, `icons.check` passes) and the reconciliation is flagged as
  pre-launch polish.
- **Full test-down placement UI deferred.** Placement is no longer on the
  first-problem path (§4.5); the coarse "mitt barn ligger fel" correction ships
  as an årskurs change (re-seed + replay). The interactive test-down assessment
  is not rebuilt.
- **Some CRUD is API-only.** Void/reassign/replay/export and årskurs change have
  routes and are tested; soft-delete/restore of a family and the reassign *UI*
  are not fully surfaced in the parent screen.

## Extending the skill graph

The graph is delivered whole in `src/skills.ts` — 77 skills, one per cognitive
*seam* (carrying, borrowing across a zero, a negative solution: each its own
skill). To add one: it must be a single seam, have a `year` and a `mode`, its
`steps` must be genuine intermediate lines, and `test/verify.test.ts` (500
deterministic draws per skill) must stay green. Do not merge skills to shorten
the file — every distinction absent there is one the system can never learn.
```
