# Onboarding: the warm-up ramp

Extends `ui-lifecycle.md` §4.3–4.5 (first run, placement-is-not-a-gate),
`motivation.md` (sessions), `handoff.md` (the seed and θ). This adds a warm-up to
the *start of a session* that does not touch the seed, the target, or the honest
θ update — it changes only which items are shown first, and how much they count.

It exists because a session does two jobs — orient the child, and calibrate to
her — and the current build only does the second. Calibration sits the child at
her ~80% edge, which is correct for measurement and wrong for a first
impression: a six-year-old meeting a new app and immediately getting problems
she can't do concludes she's failing, before she has learned that the system is
*supposed* to sit at her edge.

Observed, first real session: an åk-1 child got two-digit addition immediately
(near her seeded level — working as designed), pressed "vet inte," and kept
getting that level (the 80% target, working as designed). Correct behaviour,
wrong felt experience. The fix is not to change the target. It is to precede it
with an easy, climbing warm-up that teaches the mechanics on problems she will
almost certainly get right.

---

## 1. What the warm-up is, and is not

**Is:** the first several items of a session, starting well below the child's
level and climbing to it over ~6–10 items. Easy enough at the start to be
near-certain wins. Its job is orientation and confidence — learning the input,
the check, the "vet inte" button, the rhythm of a right answer — on problems that
are not simultaneously taxing.

**Is not:** measurement. Warm-up items update θ **weakly or not at all** (§4).
Their purpose is to get the child *to* her edge already knowing how the app
works and already feeling capable — not to estimate where her edge is. The seed
already estimates that; the warm-up must not fight it.

**Is not:** a permanent easy mode. It *climbs to* her real level and hands off to
the honest adaptive engine. An app that stays easy to keep the child feeling good
is the engagement trap; an app that *starts* easy to orient and then meets the
child honestly is good onboarding. The distinguishing property is that the easy
phase **ends**.

---

## 2. The ramp

At session start, for a warming-up player (see §3), serve `RAMP_LEN` items whose
difficulty climbs from an easy floor to the child's seeded/current level.

- **Floor.** First item targets a high predicted success — p ≈ 0.95 — using the
  child's *current* θ per skill to pick something she'll almost certainly get.
  Prefer a skill she has already succeeded on if history exists; for a brand-new
  child, pick from the lowest-tier unlocked skills.
- **Climb.** Each subsequent warm-up item targets a p stepping down from ~0.95
  toward the normal 0.80 target, linearly across `RAMP_LEN` items. By the last
  warm-up item she is at her real edge.
- **Handoff.** After `RAMP_LEN`, the normal selector takes over unchanged —
  0.80 target, interleaving, spacing, the lot. No visible seam; the difficulty
  has simply arrived at her level and stays there honestly.

`RAMP_LEN` is per-session-instance and depends on how much onboarding the child
still needs (§3). It is never longer than about a third of the session target, so
the honest adaptive portion is always the majority of the session.

The ramp still **interleaves** — it is not the same skill six times. It climbs in
difficulty while varying skill, so the child also learns from the first moment
that problems come in different kinds. Climbing difficulty, mixed content.

---

## 3. Fading across the first several sessions — not just once

A single first-session warm-up assumes the child has learned the app in one
sitting. A six-year-old has not. So the warm-up **fades over the first
`ONBOARD_SESSIONS` sessions** (default 4; tune between 3 and 5), rather than
appearing once and vanishing:

| session | RAMP_LEN (of a 12-item target) | feel |
|---|---|---|
| 1 | ~8 | mostly gentle; learning the app, lots of early wins |
| 2 | ~5 | a warm start, then real work |
| 3 | ~3 | a couple of easy ones to settle in |
| 4 | ~1–2 | a single opener |
| 5+ | 0 | straight to her level; she knows the game now |

The ramp length is a function of *completed sessions*, read from `session_run`
history — not a flag, so it survives replay and can't drift. A returning child
five sessions in drops straight to her edge; ramping her would be condescending
and would waste practice on problems she's outgrown.

Rationale for fading rather than a hard first-only switch: confidence and
familiarity build over several exposures, and the second and third sessions are
where a "math-positive" child either consolidates *I can do this* or quietly
files the app under *that thing that got hard*. A warm start on those sessions is
cheap insurance against the second outcome, and it's gone before it can become a
crutch.

---

## 4. The honesty constraint — this must not corrupt θ

The warm-up shows easy problems. Easy problems answered correctly must not inflate
the estimate, or the warm-up becomes a θ-inflation machine and the seed's honest
work is undone.

Rules:

- **Warm-up items update θ weakly.** Apply the θ update with a reduced weight
  (halve it, as with "vet inte"), or not at all for the easiest floor items.
  Record on the attempt that it was a warm-up item (`warmup: true` in
  `item_json`), so replay reproduces the reduced update and so analysis can
  exclude warm-up attempts.
- **A miss during warm-up still counts normally.** If the child misses an item
  she was predicted to get at p ≈ 0.95, that is real, surprising, and
  informative — do not suppress it. Asymmetry is correct here: easy *successes*
  are uninformative (she was meant to get them), easy *failures* are highly
  informative. Weak update on success, full update on an unexpected miss.
- **Warm-up items are excluded from probe and evidence analyses** by the
  `warmup` flag, so they never contaminate the clean measurements
  (`evidence-and-theses.md`, `quasi-experimental.md`).
- **"vet inte" during early warm-up is read gently.** In the first session
  especially, a "vet inte" on an easy opener more likely means "I don't yet
  understand what this app wants" than "I don't know this maths." Give it the
  same weak weight as other warm-up items; do not let first-day app-confusion
  register as a maths gap. By the time the ramp reaches her edge, a "vet inte" is
  more likely to be genuine.

The net: the warm-up moves *what she sees*, never *what the system honestly
believes about her*. The seed estimates her level; the warm-up just walks her up
to it kindly, and reports back only the genuinely surprising.

---

## 5. Framing to the child

The warm-up must feel like the app *showing her how it works*, not testing her.
No "let's see what you can do," no "warm-up" label, no "level 1." Just easy
problems that get gradually less easy, indistinguishable in presentation from any
other problem — same screen, same quiet check, same rhythm. The child should
never be told she is being eased in; she should simply find that the app started
somewhere she could stand.

Nothing about the ramp appears in the UI. It is a selection policy, not a mode.

---

## 6. Acceptance

- A brand-new player's first item has predicted success ≈ 0.95 at her seeded θ,
  not ≈ 0.80. Assert over simulated new players across school years.
- Across the first `ONBOARD_SESSIONS` sessions, `RAMP_LEN` decreases to 0 as a
  function of completed-session count; session 5+ has no ramp. Snapshot test.
- The ramp climbs in predicted difficulty while varying skill code — no skill
  repeats consecutively within the ramp. Assert.
- A warm-up success updates θ with reduced weight; a warm-up miss updates fully;
  both are reproduced by replay. Assert via a replay-equality test that includes
  warm-up attempts.
- Warm-up attempts carry `warmup: true` and are excluded from probe and
  quasi-experimental analyses. Grep the analysis readers for the exclusion.
- Removing the warm-up policy entirely changes the seed and the honest θ update
  not at all — it is a pure pre-filter on selection. Assert that θ after a
  ramped session equals θ after the same answers served without the ramp, given
  the reduced-weight rule. (This is the test that proves the warm-up can't
  corrupt the instrument.)

---

## 7. Order and tuning

1. Build the ramp for session 1 first (the observed pain point), reduced-weight θ,
   `warmup` flag. Watch one real child through it.
2. Add the fade across `ONBOARD_SESSIONS` once session 1 feels right.
3. Tune `RAMP_LEN`, `ONBOARD_SESSIONS`, and the floor p against real first
   sessions — these are guesses with the right shape, like every constant in this
   project. The signal to tune against is not a number: it is whether a
   math-positive child finishes her early sessions wanting another.

The measure of success for this whole document is behavioural, not statistical:
a new child should reach the end of her first session having mostly succeeded,
having learned the mechanics, and having arrived at her real edge without ever
feeling she hit a wall. Whether she asks to do it again is the only acceptance
test that finally matters.
