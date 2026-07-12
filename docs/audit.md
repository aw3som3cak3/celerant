# Audit: report the implementation as it actually is

Do not change any code during this task. This is an inventory, not a fix. If you
find something broken, **write it down and move on** — resist repairing it,
because a silent fix hides the drift I'm trying to see. The one deliverable is a
report. The one rule is honesty over reassurance: a report that says "all good"
when it isn't is worse than useless.

You will be tempted to present the system as more finished and more compliant
than it is. Every audit does this. Counter it deliberately: for each section
below, actively look for the ways the implementation *diverges* from the specs,
not the ways it matches.

The specs, in precedence order (later corrections override earlier text):
`agent-brief.md` → `fluency-addendum.md` → `feedback-placement.md` → `handoff.md`
→ `ui-lifecycle.md` → `motivation.md` → `the-map.md` → `instrumentation.md`.

---

## How to report

For every item below, give one of four verdicts, and **show the evidence** — a
file path and a quoted line or a short excerpt. A verdict without evidence is an
opinion, and I can't act on it.

- **MATCHES** — implemented as specified. Cite where.
- **DRIFTED** — implemented, but differs from spec. Show both what the spec says
  and what the code does, and say which you think is right (the code may be the
  better answer — drift isn't always a bug, but it's always worth surfacing).
- **MISSING** — specified, not implemented. Say whether anything depends on it.
- **UNSPECCED** — implemented, but no spec asked for it. These matter as much as
  the missing ones: unrequested behaviour is where scope creep and quiet
  assumptions hide.

Keep prose minimal. A table or a tight list per section. I want density, not
narrative.

---

## 1. The load-bearing invariants

These are the ones that, if broken, break everything downstream. Check each
directly — read the code, don't infer from the tests passing.

1. **Ledgers vs cache.** Are `attempt`, `sprint`, `tool_rate` genuinely
   append-only? Grep for every `UPDATE` and `DELETE` against them. The only
   permitted mutations are setting `voided_at` and the ownership `UPDATE` in the
   wrong-child reassign. List every write site and classify it.
2. **`replay()` reproduces the cache exactly.** Does the test actually compare
   byte-for-byte, or does it compare a subset of columns? Show the assertion. Now
   that RD and volatility exist (`instrumentation.md` §3), does replay
   reconstruct those too, or only θ?
3. **No public write path to `ability`.** Is there any route, any function
   reachable from a route, that writes `ability` outside `replay()`? Show the
   write sites.
4. **β is gone.** Not "set to zero" — *gone*. Grep for `beta`. If it exists as a
   column, a variable, or a parameter anywhere, that's drift from `handoff.md` §1.
5. **`player_id` is not on `session`.** Confirm the column doesn't exist and that
   `player_id` arrives as a per-request parameter asserted against the family
   (`ui-lifecycle.md` §6.6). Show the assertion.
6. **Difficulty seed anchoring.** What formula seeds θ? Quote it. Given an åk-4
   child, what is the predicted `p` for a year-1 skill versus a year-4 skill, and
   which does the selector serve first? (This is the bug from the last review —
   confirm whether the fix landed or whether a competent child still opens on
   number bonds.)

## 2. The model

- The θ update: quote it. Confirm first-attempt-only, the retry rule, the
  "vet inte" half-weight, the slip/lapse floor if `instrumentation.md` §3 landed.
- RD: does it **grow during idle periods**, or does it only shrink (i.e. is it
  still the old monotonic `k` wearing a new name)? This is the whole value of the
  change; show the idle-growth code or mark it MISSING.
- Volatility: is it computed, and does anything read it (the fluency gate)? Or is
  it stored and ignored?
- The selector: target p, the interleaving penalty, the spacing/decay term, the
  peak-end rule (item 20 = highest-p eligible). Quote the scoring function.
- Confirm the phase-2 simulation exists and what accuracy band it currently
  reports.

## 3. The graph and generators

- Does `verify.ts` run in CI? How many skills does it check, and does the count
  match `skills.ts`?
- Is `item_json` storing the **features** (`instrumentation.md` §2)? This is the
  one with a deadline — if it's MISSING, say so loudly and first. For a sample of
  skills, show the stored feature vector.
- Does the features check exist (regenerating from seed yields the same vector;
  tagged operands evaluate to the stored answer)?
- Are worked-solution `steps` genuine intermediate lines, or restatements?

## 4. Identity, flow, lifecycle

- Family = unordered **pair** of icons, canonical storage? Show `familyKey`.
- Two PINs, entry ≠ parent, and the entry-PIN change requires the *parent* PIN?
- **Placement is not a gate** (`ui-lifecycle.md` §4.5): does a new player hit a
  real problem immediately, with no tool/placement detour? Trace the first-run
  path and show it.
- Device cache holds `family_id` only — never PIN, token, or `player_id`? Show
  what's written to storage.
- The wrong-child reassign: does it exist, and is it API-only or is there UI?
- Årskurs change triggers replay rather than a re-seed that discards evidence?

## 5. The motivational layer — and its firewall

The critical property (`motivation.md` §5): the motivational layer is strictly
downstream of the model. **Dropping `card`, `session_run`, `family_goal`,
`goal_event`, `usage_event` must change no θ, no rate, no unlock.** Is there a
test asserting this? If not, mark it MISSING — it's the guarantee that keeps
incentives from corrupting the instrument.

Then check the forbidden list (`motivation.md` §2). Grep for: any table or field
storing points, XP, coins, a streak length; any reward keyed on `correct`; any
per-child contribution to a family goal exposed in a route or query. Each hit is
a serious finding.

- Session counted in **items**, and the target — is it the stale 20, or the
  intended 12/per-player value? (The dots-per-day check was gated on 20 last
  review; confirm.)
- "vet inte" counts toward session completion? Show it.
- The 7-day dots: are they behind the **child's own** icon (private) or on a
  shared menu (comparison surface)? This drifted last review; confirm where they
  landed.
- Day boundary: UTC or `Europe/Stockholm`?
- Parent-view accuracy: is it a **per-skill accuracy table** (a report card,
  forbidden) or **threshold-triggered sentences** (bug-detectors, permitted)?
  This is the specific correction from two reviews ago; show what rendered.

## 6. The map

- Child map payload: does it contain **only** reached + frontier + one silhouette
  ring, with everything beyond **absent from the response** (not CSS-hidden)?
  Show the payload shape for a mid-progress player.
- Does it leak a total count, a percentage, or a distance-to-node field? Grep the
  response builder.
- Frontier set == the three-way skill choice set (`the-map.md` §8)? Same query?
- Parent map = all 77 nodes; child map never all 77. Confirm both.
- Node positions stable before/after a node is reached?

## 7. Instrumentation and export

- Feature tags: covered in §3 above, but confirm `features_version` is present.
- `goal_event` and `usage_event` ledgers exist and are append-only?
- Export (`GET /family/:id/export`): does it carry attempts-with-features,
  sprints, tool_rate, session_run, goal_event, usage_event — and does it
  correctly **exclude** the `ability` cache?
- Anything in the "out of scope" list (`instrumentation.md` §6) that got built
  anyway? Problem-type ratings, an LLM in the path, neural KT? Grep and confirm
  absence.

## 8. The deferrals — are they still where you left them?

Last handoff flagged: scrypt-not-argon2id, CLDR reconciliation deferred, some
UI API-only. For each, confirm it's still in that state and hasn't silently
changed, and that each is still documented in the README.

---

## 9. The three lists I actually want

End the report with these, because they're what I'll act on:

1. **Drift that improved on the spec.** Where the code diverged and is *better*.
   I'll fold these back into the specs so they stop reading as drift.
2. **Drift that's a bug.** Where the code diverged and is *worse*, ranked by
   blast radius — invariant-breakers first, cosmetics last.
3. **The one-line health check.** After all of the above: is the core guarantee —
   *the model is honest and the motivational layer can't corrupt it* — currently
   intact, yes or no? If no, the single most important thing to fix.

Do not fix anything. Report, then stop.
