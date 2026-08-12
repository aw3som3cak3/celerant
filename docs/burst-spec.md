# Burst — implementation spec

Status: **design proposed, shadow-gated build.** Continues `docs/one-ova-track-spec.md` WS III.
The engine (selector, θ, gate, ledger, timing, rate, sprint award machinery) is **reused, not
rebuilt** — the burst is a delivery-and-trigger change over the existing sprint pipeline, not a
new measurement system.

---

## Why this supersedes the pure-passive diploma (the case, with data)

`one-ova-track-spec.md` WS III awards the diploma on a **pure passive practice-rate crossing** —
no timer, no run — but made it conditional on **Requirement A (Shadow First):** *prove calm
practice-rate agrees with sprint-rate first; if practice reads systematically lower, add a
measured calibration factor.*

**The shadow read (2026-08-12, live prod, real family) is that proof, and it fails the pure model:**
- practice/sprint rate ratio **median 0.56**, spread **0.43–0.98** (n=14).
- The 0.5-factor trigger (`SHADOW_TRIGGER_FACTOR`, `src/lib/fluency.ts:22`) runs **~71% precision**
  where adjudicable (10 confirmed vs 4 "eager") and **~10/12 recall**.
- The spread means **no single factor cleanly converts practice-rate → capability** — exactly the
  "diploma measures temperament" failure Requirement A warned about. Every one of the 4 eager
  fires is a high-ratio child (0.64–0.98) whose calm pace already ≈ their sprint pace, so a raw
  practice-rate award would hand them a diploma they didn't earn on speed.

**The burst is the resolution.** Instead of *guessing* a factor to rescue calm practice-rate, the
burst *reproduces the measurement condition that made sprint-rate valid* — Requirement A's own
words: *"a warmed-up, go-fast batch on one skill with the same problem shape repeating"* — but
**without the stopwatch, the verdict, or the reward.** So:

- The shadow practice-crossing (`shadow_fluency`, `recordShadowFluency` `src/db/repo.ts:1283`) is
  **demoted to the OFFER signal** — it decides *when a skill looks ready enough to measure*, never
  the award. (Its 71% precision is fine for an offer: a burst offered slightly early is adjudicated
  by the burst.)
- A **burst** — a short consecutive run of that one skill, served inline in ordinary Öva, silently
  timed — is the **capability measurement**.
- The diploma is awarded **only on the burst's real timed crossing**, revealed **only on the
  done-screen** (`one-ova` Decision 2 preserved). Done-never-failed; pays nothing extra.

**The one new risk this introduces:** does a *silent* consecutive run read at sprint level without
the go-fast prompt? The warm-up (same shape repeating) should raise the rate toward sprint level,
but maybe not fully. This gets the same discipline as everything else here — **the burst measures
in shadow first**, validated against the kids' existing sprint ground-truth, before any diploma
depends on it (§6, Phase B0).

---

## The shape (decided)

- A burst is **not a new render format.** It renders on the existing `InputStage` numpad. What is
  new is a **session-level "this block is a timed run" mode**, driven server-side.
- A burst is **invisible to the child** — no banner, no timer, no count-up, no "how many can you
  do", no per-run verdict. It looks exactly like ordinary practice. This is what makes it
  un-optimizable and automatically *done-never-failed*.
- The burst's items are **ordinary session items** — they pay the same 1 point through the session;
  the crossing itself pays **nothing** (`MILESTONE_BONUS` dropped, per `one-ova` WS III).
- The crossing is a **diploma**, witnessed on the **done-screen**, batched, peak-end — never
  mid-session.
- **Youngest / recognition rungs are out of scope** (see §8): bursts are for *sprintable* (numpad)
  skills only, exactly as `recordShadowFluency` already bails on `format:'choice'`
  (`src/db/repo.ts:1285`). The youngest's recognition fluency stays the `recog_shadow` crossing.

---

## The design — what a burst *is*

### Trigger (the OFFER signal)
At item-selection time, a skill is **burst-ready** when all hold:
1. **Sprintable + unlocked** — `meta.sprintable && unlocked.get(code)` (mirrors
   `sprint-eligibility.ts:70`).
2. **Accuracy-mastered ("building" band)** — `recentFirstTryAccuracy ≥ SPRINT_ACCURACY_GATE (0.95)`
   over `SPRINT_ACCURACY_WINDOW (20)` since any collapse-cooldown (`sprint-eligibility.ts:80-81`).
3. **Not already earned-fluent** — `!everMilestonedSkills(playerId).has(code)`
   (`src/db/repo.ts:1354`).
4. **Shadow-ready** — clean practice rate `≥ SHADOW_TRIGGER_FACTOR × aim` (the existing
   `recordShadowFluency` condition, `src/db/repo.ts:1304`). This is the readiness gate the shadow
   data validated as a *screen*.
5. **Cooldown clear** — no burst on this skill within `BURST_COOLDOWN_MS` (new; propose 48h), so a
   near-miss re-measures later without grinding.

The burst-ready set = `eligibleSprintSkills` (building band, **easiest-first** — `year` then prereq
depth, `sprint-eligibility.ts:95-102`) **intersected** with conditions 4–5. Pick **easiest-first,
never random** (guardrail: the run opens on the child's most solid skill).

### Delivery (the run)
When a burst-ready skill exists and the child is warmed into the session (not item 1 — respect the
onboarding ramp / start-from-below), the **selector enters burst mode**: `issueNext`
(`src/lib/practice.ts:446`) serves `BURST_ITEMS` consecutive items of that one skill instead of
interleaving, each tagged with a `burst_run_id`. Proposed `BURST_ITEMS = 8` (below the sprint's 20,
`src/lib/sprint.ts:193` — young-enough sessions, and it may span the "en till?" pass; the rate is
computed over the tagged run's valid intervals regardless of the session boundary).

The **only client-visible change**: a burst item runs the `InputStage` **sprint-style auto-submit
clock** (`mode:'sprint'`, `reachedLength` auto-submit — `InputStage.tsx:155-157`), so the interval
is the same clean render→answerLength boundary a sprint measures. The client learns this from a new
per-item flag `IssuedItem.burst?: boolean` (`src/lib/practice.ts:436`); everything else — timing,
`intervalMs` capture, the `/api/session/answer` post — is **unchanged** (`page.tsx:207-246`).

No new stage, no new screen, no banner. (This diverges from the mapping agent's "add a third
`Skill.format` enum" suggestion — a burst is a *timing mode over numpad skills*, not a new render
format, so `Skill.format` is untouched.)

### Adjudication (the award)
On the run's final item, ingest computes the rate exactly as a sprint does and reuses the whole
award path:
- rate `= correct × 60000 / Σ valid intervalMs` over the run's items (`isValidInterval`,
  `src/lib/rate.ts:12`).
- `classifySprint(correct, errors, rate, aim)` + `sprintRateIsCredible` (`src/lib/fluency.ts:40,57`).
- **milestone** (rate ≥ aim ∧ acc ≥ 0.9) → write the crossing; **collapse/near-miss** → write a
  voided/non-award row, nothing shown, re-measure after cooldown (done-never-failed).

### Storage — reuse the sprint ledger with a `source` tag (recommended)
Rather than a *separate* practice-crossing store, a burst writes a row into the **existing `sprint`
ledger** (`schema.ts:71`) via the existing `appendSprintIngest` (`src/db/repo.ts:335-357`), with one
new nullable column `source TEXT DEFAULT 'sprint'` set to `'burst'`. Consequences:
- `replay` (`replay.ts:99-110`), `everMilestonedSkills` (`repo.ts:1354`), the measured-rate flip,
  and the fluent-drop **all keep working unchanged** — they read `sprint` rows.
- *"Keep the sprint ledger forever"* (`one-ova` Requirement B) is honored — it now also holds bursts.
- This **simplifies** `one-ova`'s "new append-only source + `earnedFluent` unions both" to "bursts
  are sprint rows, tagged" — strictly less surface, same invariants. **(Decision for Erik — §7.)**

---

## Reusable machinery (nothing here is rebuilt)

| Need | Reused from |
|---|---|
| Per-item client clock, auto-submit boundary | `InputStage.tsx:105-157` (`mode:'sprint'`) |
| Interval validity + rate | `src/lib/rate.ts:12-34` |
| Batch ingest, idempotency, void-if-not-credible | `sprint.ts:238-282`, `repo.appendSprintIngest :335` |
| Outcome classification + floors | `fluency.ts:40-60` (`SPRINT_ACC_FLOOR .9`, `COLLAPSE .5`) |
| Aim (additive, digit-adjusted, tap floor) | `fluency.ts:157` `aimFor`, `bestObservedDigitRate` |
| Measured-rate flip on replay | `replay.ts:99-110` |
| Monotonic earned-fluent | `repo.everMilestonedSkills :1354` |
| Readiness / offer signal | `repo.recordShadowFluency :1283`, `shadow_fluency` `schema.ts:343` |
| Eligibility band + easiest-first order | `sprint-eligibility.ts:54-102` |
| Fluent-drop (p-band decay + year-0 floor) | `selector.ts:213-237` |
| Diploma wall (private record surface) | practice done-screen 🏅 (`page.tsx`) |
| Test-family gate pattern | `/api/me` `isTestFamily` `me/route.ts:27`, re-checked server-side |

---

## The build — touch points

**Server (the real work):**
1. `src/lib/burst.ts` (new) — `burstReadySkill(playerId, states)` (conditions 1–5); `BURST_ITEMS`,
   `BURST_COOLDOWN_MS`, `lastBurstAt`.
2. `src/lib/practice.ts` — `issueNext`/`sessionSelectOpts`: when a burst is active or a ready skill
   is picked, hold the skill for `BURST_ITEMS`, stamp `burst_run_id` + `IssuedItem.burst = true`.
3. `sessionAnswer` (`practice.ts:521`) — thread `burst_run_id` onto the attempt; on the run's last
   item call a `ingestBurst` that reuses `appendSprintIngest` with `source:'burst'`.
4. `src/db/schema.ts` — `ALTER TABLE sprint ADD COLUMN source TEXT DEFAULT 'sprint'` (additive,
   nullable, no brick); a `burst_run` marker (id, player, skill, session_run, started_at) **or**
   reuse `session_run_id` + a contiguous-same-skill window (simpler; propose the explicit marker).
5. `src/app/api/me/route.ts` — add `burst?: boolean` = `isTestFamily` initially (§6 gating).

**Client (one flag):**
6. `src/app/practice/page.tsx` — read `item.burst`; pass it so `InputStage` runs `mode:'sprint'`
   auto-submit. **No new branch at the `:362` render seam.** Done-screen: extend the existing
   diploma reveal to include burst crossings (Phase B1 only).

**Retire at cutover (Phase B1), keep the ledger:** `/sprint` page, `/api/sprint/{offer,eligible,
batch,ingest}`, the done-screen sprint-offer card (`page.tsx:306-324`), `MILESTONE_BONUS` payout
(`sprint.ts:267-274`). Keep `sprint` rows, `everMilestonedSkills`, the diploma wall.

---

## Staging (shadow-first for the burst itself; each test-family-gated first)

- **Phase B0 — BURST IN SHADOW.** Build delivery + ingest, writing `source:'burst'` rows flagged so
  they **do not award** (excluded from `everMilestonedSkills`, no done-screen reveal). `/sprint`
  stays live. **Agreement check:** for skills a child has *both* burst-measured and sprint-measured
  (mouse has the richest sprint history), does the burst cross the same aims the sprint did? If
  burst-rate reads systematically below sprint-rate, that gap is measured here — and, unlike calm
  practice-rate, a *measured* burst→sprint factor is legitimate because the burst is already a
  go-fast batch (we'd be correcting warm-up depth, not temperament).
- **Phase B1 — CUTOVER.** `source:'burst'` rows award; done-screen reveals *"Grattis, du fick
  diplom i X!"* (batched); retire the `/sprint` UI + offer + bonus; keep the ledger + wall. **Only
  after B0 agreement**, test-family first, then all four.

---

## Decisions for Erik (flagged, not assumed)

1. **Copy / framing.** The `ws3-burst-shadow` note floated *"Hur många hinner du?"* — but *hinner*
   is a **time word**, and the 2026-07-24 speed-run guardrail explicitly stripped speed framing
   ("no *see how fast you are*"). Recommendation: **no framing at all** — the burst is invisible,
   indistinguishable from practice. If you want a soft lead-in, make it count/no-time
   (*"en liten runda med plus"*), never *hinner*/*snabbt*/*tid*.
2. **Reward / economy.** `one-ova` says drop `MILESTONE_BONUS` (burst pays nothing; the session's 1
   point stands) — guardrail-purest, recommended. But it **removes a shared-goal unit source** (the
   cooperative goal then advances only via sessions). Confirm you accept that, vs the older
   "auto-send the bonus to the shared goal off-screen" behavior.
3. **Storage.** Reuse the `sprint` ledger with a `source` tag (recommended, minimal) vs a separate
   `practice_crossing` store as `one-ova` Requirement B originally worded. Both preserve the
   invariants; the tag is less surface.
4. **Requirement B (stored vs re-derived aim).** Note the *existing* `everMilestonedSkills`
   **re-derives** the aim at replay time (`repo.ts:1369` calls `aimFor` with current toolRate/grade),
   not a stored snapshot — so sprints today already carry the re-derivation Requirement B cautions
   about. Options: (a) match existing sprint behavior (bursts == sprints, ship now, close Req B
   separately for both), or (b) snapshot the aim on the row and read it back (closes Req B for
   bursts *and* sprints). Recommend (a) now, (b) as a small follow-up so it lands for both at once.
5. **Constants.** `BURST_ITEMS` (propose 8), `BURST_COOLDOWN_MS` (propose 48h) — tune on B0 data.

---

## Guardrail compliance (checked against `docs/motivation.md` / memory)

- **Witness, don't reward** — burst pays nothing; the only output is a diploma that witnesses a
  crossing that already happened. Nothing to optimize (the run is invisible).
- **No child-facing speed readout / verdict** — no timer, no rate, no pass/fail; done-never-failed.
- **Not optimizable mid-session** — the crossing is revealed only on the done-screen, batched
  (Decision 2). The activity being mid-session is fine because it carries no visible stake.
- **Private, not comparative** — the diploma lives behind the child's own icon; no sibling surface.
- **Easiest-first, never random** — the run opens on the most solid ready skill.
- **Ending early is a button** — a burst spanning into an unstarted pass simply doesn't complete;
  no penalty, re-measured after cooldown.

---

## Scope boundaries

- **Youngest / recognition rungs: out.** Bursts require `sprintable` (numpad) skills. The youngest
  (all `format:'choice'`) gets no bursts; her fluency stays the `recog_shadow` accuracy crossing
  (D2a, live). **D2b** (a *rate* threshold on recognition rungs) remains parked pending recognition-
  aim calibration from `recog_shadow` data — that is the separate track for recognition speed, not
  this burst.
- **The `ground_count` cap (shipped 2026-08-12)** is what unblocks the youngest; the burst does
  nothing for her and should not be conflated with it.

## Engine boundary / stop-flag

Selector, θ, gate, ledger, reward-per-session reused. The three real changes: a **timing mode in
the session flow** (bounded, server-driven, one client flag); **re-sourcing the diploma trigger to
burst crossings**; **dropping the bonus** (behaviorally load-bearing → shadow-gated at B0).
**Stop-flag (unchanged from `one-ova`):** rate stays a downstream ledger read; the moment the burst
wants the *selector* or *θ* to reason about rate, stop and reassess.
