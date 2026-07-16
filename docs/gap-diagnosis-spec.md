# Prerequisite-gap diagnosis + precision remediation — implementation spec

A child can be at grade level yet missing one or two early **fluency** concepts:
accurate but slow, effortful. Accuracy testing can't see it; the hole silently
taxes everything downstream. This feature detects the specific weak node(s) by a
**latency** signal, relocates to the **deepest non-fluent prerequisite** by binary
search over the prerequisite DAG (~3–4 probes, not a level-by-level crawl), and
remediates **only** that root to a rate criterion — the child stays at grade level
everywhere else.

## 0. Ground truth (verified in code) and locked decisions

Verified in the current codebase:
- Skill graph is a prerequisite DAG (`src/skills.ts`): `requires`, transitive
  `ancestors(code)`, per-skill `year`, `mode` (`component`|`compound`), `family`.
- Rating is one-sided Glicko-2 on **accuracy** (`src/model/elo.ts`): `dθ = rd²·(s−E)`
  — high RD ⇒ big relocation steps, low RD ⇒ small tracking steps. RD grows with idle,
  shrinks with observation. **This tracks accuracy, not rate.**
- Fluency = **rate** (correct/min from timed **sprints**): `rate`, `rate_state`
  (`unknown|provisional|measured`), `aim = 0.55 × ceiling` (`aimFor`). Unlock gate:
  `θ ≥ 0 AND (compound OR rate ≥ aim)`.
- `attempt.latency_ms` (= `now − served_at`) is stored on every item but **only read
  offline** (parent "transfer" signal). No live latency gate, **no per-skill latency
  baseline** exists.
- **GROUND/DRILL/MODEL phases are NOT implemented.** No phase/grounded/structure
  machinery.

Locked design decisions:
- **Probe = hybrid.** Per-item **latency** drives the cheap descent (2–3 timed normal
  items per probed node); one short confirming **sprint** on the located root gates
  remediation (`rate ≥ aim`).
- **Routing = DRILL now + typed GROUND hook.** Full rate/DRILL remediation now;
  "grounded" inferred from accuracy history; a typed `needsGrounding` handoff for the
  future GROUND subsystem.
- **"Slow" = personal baseline, absolute floor.** Primary: z vs the child's own
  fluent-skill latency; a writing-speed-derived absolute target as a safety bar so a
  uniformly-slow child still has a real threshold.

Design consequence of req #3: because the gap is a **fluency** deficit on skills the
child is **accurate** at, the descent cannot ride the steady-state θ. It needs a
**separate, high-uncertainty fluency estimate** per probed node — this is where
"uncertainty-aware, relocates fast" lives, kept entirely apart from steady-state
θ/rate so normal practice stays stable (req #1).

---

## 1. The signal — Latency Fluency Deficit (LFD)

Only **first-try-correct** attempts carry a clean fluency signal (wrong/retry/idk are
accuracy events, handled by the existing loop). For such an attempt on skill `k`:

- **Personal expected latency** `Lexp(child,k) = base(child) · complexity(k)`
  - `base(child)` = robust centre (median) of first-try-correct `latency_ms` on the
    child's **confirmed-fluent** skills (`rate_state='measured' AND rate ≥ aim`, or the
    fluent-by-history proxy in §5), winsorized (drop > 5× median as AFK/distraction).
  - `complexity(k)` = static per-skill multiplier for how much *solving+writing* a
    typical item takes, derived from the canonical item (operand/step count + answer
    length; reuse `src/lib/features.ts` tags). Normalizes "a 2-digit-carry is slower
    than a bond" out of the comparison.
- **Absolute floor** `Lfloor(k) = writeChars(k) / toolRate(child) · Kfluent`
  — the physical time to just *write* the answer at the child's **measured** writing
  speed (`tool_rate`), times a "fluent kids answer within Kfluent× pure write time"
  margin. Uses the child's own motor speed, so a slow writer isn't pathologized.
- **Slow?** `slow(attempt) = latency_first_try_correct > max( Lexp·Zslow , Lfloor )`.
  The `max` makes the absolute floor a *safety bar*: when the personal baseline is
  itself inflated (uniformly-slow child), `Lfloor` still fires.

`base`, `Lexp`, `Lfloor` are all **derived** from the existing attempt + tool_rate
ledgers; no new stored state (see §6). Constants (`Zslow`, `Kfluent`, winsor cap) in §9.

---

## 2. Diagnostic state machine

At most **one active diagnostic session per child**. It is a *mode over item
selection*, not a separate app screen — probe/remediation items look like normal
practice. Steady-state selection, θ, and rate are untouched for every skill not owned
by the active session (req #1).

States and transitions:

```
STEADY ──trigger(§ below)──▶ DESCENDING ──converged──▶ CONFIRMING
  ▲                              │                          │
  │                     re-probe / next mid                 ├─ sprint rate<aim ─▶ REMEDIATING
  │                                                         └─ sprint rate≥aim ─▶ (false alarm)
  │                                                                 │
  │                                                     candidates left? ─▶ DESCENDING
  │                                                     none left ───────▶ EXIT(noise)
  │                                                                          │
  └──── HANDBACK ◀── root rate≥aim, stable ── REMEDIATING ── no progress ──▶ FLOOR
                                                   │                          │
                                                   └──────────────────────────┘
                                            (both close the session; set cooldown)
```

- **STEADY** (default; not a stored state). Passive: after every first-try-correct
  attempt, update the per-skill **struggle streak** (§1 `slow`).
- **Entry trigger** → `DESCENDING`: struggle streak on a symptom skill `S` reaches
  `TRIGGER_N` slow-of-last-`TRIGGER_W` first-try-correct on `S` (consistent evidence,
  not one slip), AND no active session, AND `S` not in cooldown. Emit `DIAG_OPENED`.
  (Secondary trigger: a DRILL rate-gate that stalls below `aim` despite good accuracy
  is the same fluency signal — funnel it here.)
- **DESCENDING**: run §3. Each step serves a 2–3 item latency probe of one node and
  prunes. Converges on candidate root(s) `R`.
- **CONFIRMING**: one short sprint on each `R`. `rate < aim(R)` ⇒ confirmed →
  `REMEDIATING`. `rate ≥ aim(R)` ⇒ latency false-positive → mark `R` fluent, resume
  `DESCENDING` on any remaining unresolved branch; if none, `EXIT(noise)`.
- **REMEDIATING**: route `R` by phase (§5) to DRILL (or GROUND hook). The child works
  `R` toward `rate ≥ aim`; **the symptom `S` and any intermediate dependents are paused
  from rate-gate pressure** until `R` is fluent (don't hammer a symptom whose cause is
  upstream). Steady-state practice on unrelated skills continues.
- **HANDBACK** (exit): `R` crosses `aim` and holds (stability check, §5) → emit
  `DIAG_RESOLVED`, re-enable `S`, set per-skill **cooldown**, resume STEADY.
- **FLOOR** (give-up exit): `R` shows no rate/celeration progress after
  `MAX_REMEDIATION` → emit `DIAG_FLOOR`, surface to the **parent** as "needs a look"
  (never to the child), set a long cooldown so we don't re-loop.

---

## 3. Descent algorithm (binary search over the DAG)

Goal: the **deepest** non-fluent node in `ancestors(S) ∪ {S}` — the *root cause*, since
the visible symptom (e.g. fractions) is usually driven by an upstream hole (e.g. ×
fluency). Exploits fluency monotonicity along prerequisite edges: fluent at a node ⇒
its prerequisites are (almost surely) fluent; not-fluent at a node ⇒ its dependents up
toward `S` are (almost surely) not-fluent-either but are *symptoms, not the root*.

Direction: `S` is the top (downstream, advanced); prerequisites are *below* (upstream,
foundational). **Fluent at mid `M` → search UP (toward `S`)**; **not-fluent → search
DOWN (toward foundations)**.

```
descend(S):
  A        = ancestors(S) ∪ {S}                 # candidate nodes (a sub-DAG)
  rank(n)  = longest-path depth from a source within A   # topological order
  fluent   = {}    # probed/inferred fluent
  broken   = {}    # probed/inferred not-fluent
  unknown  = A

  while boundary(unknown) is unresolved:
     M = split_node(unknown)                    # node whose (ancestors∩unknown,
                                                 #   descendants∩unknown) are most balanced
                                                 #   → ~halves the set each probe
     r = probe(M)                               # §4 latency probe, 2–3 items
     if r == FLUENT:
        mark M and all ancestors(M)∩A as fluent  # prune DOWN: foundations solid
     elif r == NOT_FLUENT:
        mark M as broken
        mark all nodes(A) on paths M→S as broken # prune UP: dependents are symptoms
        # root is M or deeper → keep the unknowns among ancestors(M)
     else: # UNCERTAIN (one fast, one slow) → add a 3rd item; if still split, treat as
           # NOT_FLUENT (bias toward finding the gap) but flag low-confidence
        continue
     unknown = A \ (fluent ∪ broken)

  # roots = deepest broken nodes with no broken prerequisite in A (the fluent/broken frontier)
  roots = { r ∈ broken : ancestors(r)∩A ⊆ fluent }        # ∅-prereq nodes qualify
  return top-K roots by depth                              # K in §9 (default 2)
```

- **DAG handling / pruning.** `split_node` picks the node that most evenly partitions
  the remaining `unknown` by rank/subtree size (max information ≈ binary search).
  Branches that return fluent are pruned whole (their foundations are solid);
  not-fluent prunes the upward symptom cone. Each probe removes ~half of `unknown`.
- **Complexity.** For a real skill, `|A| ≈ 5–15`; `⌈log₂|A|⌉ ≈ 3–4` probes → the target.
- **Multiple simultaneous gaps.** Independent non-fluent branches yield multiple
  `roots`; return the deepest `K` (default 2, keep it surgical). Any gap beyond `K`
  re-triggers naturally later (§7-4).
- **Uncertainty-aware, fast.** Each node holds a high-K fluency belief
  `{FLUENT|NOT|UNKNOWN, confidence}` that flips decisively on 2 consistent items (the
  "surprised ⇒ big move" of Glicko RD, applied to a **throwaway diagnostic estimate**,
  never to steady-state θ/rate).

---

## 4. Probe criterion — "fluent enough at a node"

**Descent probe (latency), 2–3 items.** Serve real items of node `M` at its own
difficulty (not warmed-up; the child is expected to be *accurate* here — we're timing
SPEED). Measure first-try-correct `latency_ms`.
- **FLUENT** iff accuracy ok (≥ 2/3 first-try-correct) **and** median latency ≤
  `max(Lexp·Zprobe, Lfloor)`.
- **NOT_FLUENT** iff median latency slow, **or** accuracy poor (can't even get it right).
- **Item budget (uncertainty-aware):** start with **2**; decide if both agree; add a
  **3rd** only if they split; cap at 3. → few items when decisive, one more when
  surprised. Low failure exposure: probes are *foundational* skills the child mostly
  gets right — a relief, not more pressure.
- Latency is compared to the child's **own** baseline (same `latency_ms` definition),
  which cancels systematic read/setup time.

**Confirming sprint (rate), 1 per root.** On each located `R`, one short existing-format
sprint → **measured** rate. Confirmed non-fluent iff `rate < aim(R)`. Authoritative gate
before committing remediation (kills latency false-positives). If `R` is not
sprint-eligible (rare for a foundational node), fall back to a longer 5–6 item latency
confirm.

---

## 5. Remediation & routing (surgical)

Route each confirmed root `R` by **phase**, inferred from accuracy history:
- **`grounded(child,R)`** ⇔ ≥ `G` accurate first-try attempts on `R` (the symbol has
  meaning). Derived, no new store.
- **NOT fluent + grounded** (accurate, slow) → **DRILL**: rate remediation to `aim`
  (existing sprint/fluency machinery). *Wired now.*
- **NOT fluent + NOT grounded** (can't reliably get it right) → **GROUND**: emit the
  typed handoff `needsGrounding{ node:R, evidence }`. Until GROUND ships, this flags the
  node for the parent surface and does not auto-DRILL (drilling an ungrounded symbol is
  wrong). *Typed hook; deferred.*

Surgical guarantees:
- Only `R` (≤ K roots) enters remediation. Every other skill continues at grade level —
  **no full regression**.
- While remediating `R`, **pause the rate-gate pressure on `S` and intermediate
  dependents** (they can't be fluent until `R` is) — no "you failed X" churn.
- **Resolution stability:** `R` handed back only when `rate ≥ aim` on a *fresh* sprint
  AND it holds (e.g. 2 sprints or a non-negative celeration slope), so we don't bounce
  out on a single lucky sprint.

---

## 6. Ledger events & derived state

Preserve append-only + replay + "steady-state model state untouched":

- **Probe & remediation & sprint items are REAL attempts/sprints** → existing
  `attempt`/`sprint` ledgers; they update θ/rate via normal replay (a solve is a solve —
  legitimate evidence). Tag `item_json.diagnostic = true` (+ `session_id`, `probe_node`)
  for provenance/analysis only. **No change to the θ/rate update or the selector for
  these — they are just attempts at a chosen skill.**
- **New downstream ledger `diagnostic_event`** (control state; the **ability replay
  never reads it**, exactly like the motivational layer):
  - `DIAG_OPENED   { session_id, player_id, symptom_skill, evidence, at }`
  - `DIAG_PROBE    { session_id, node, result:FLUENT|NOT|UNCERTAIN, median_latency, n, at }`
  - `DIAG_LOCATED  { session_id, roots:[skill], at }`
  - `DIAG_CONFIRM  { session_id, root, sprint_rate, aim, confirmed:bool, at }`
  - `DIAG_REMEDIATE{ session_id, root, route:DRILL|GROUND, at }`
  - `DIAG_RESOLVED { session_id, root, final_rate, at }`  /  `DIAG_FLOOR { session_id, root, reason, at }`
- **Derived (replay of `diagnostic_event`)**: active session? current phase; probe
  beliefs; remediation targets; per-skill **cooldown-until**. Consumed by the selector
  (§8-3) and the parent view.
- **Derived from existing ledgers (no new store)**: `base(child)`, `Lexp`, `Lfloor`,
  the per-skill **struggle streak**, and `grounded(child,k)`.
- **New static skill metadata**: `complexity(k)` and `writeChars(k)` (compute from the
  canonical item / `features.ts`), plus a cached per-node topo `rank` for §3.

---

## 7. Edge cases

1. **Careless slip vs real gap** — require `TRIGGER_N`-of-`TRIGGER_W` slow first-try-
   correct to enter; ≥ 2 consistent items to resolve a probe node. Winsorize latency
   outliers (> 5× baseline ⇒ AFK, excluded). A single slow answer never triggers.
2. **Multiple simultaneous gaps** — descent returns up to `K` roots (deepest per
   independent branch); remediate deepest-first; surplus gaps re-trigger later.
   Framing stays "sharpen these 2," never a list of failures.
3. **Floor / give-up** — no rate/celeration progress after `MAX_REMEDIATION` ⇒
   `DIAG_FLOOR`, parent-surface "needs a look", long cooldown, stop auto-looping. Also a
   *descent* floor: never search below the child's genuinely-fluent foundation — if the
   deepest ancestor is fluent, the gap is a mid-node between it and `S`.
4. **Re-entry / new gap later** — re-triggerable. Post-resolution **cooldown** per skill
   prevents immediate re-fire on residual slowness while fluency settles. A different
   skill triggers independently. Only one active session at a time; a second symptom's
   evidence persists and opens after the first closes.
5. **Wrong answer during a probe** — an accuracy failure is ambiguous (slip vs
   ungrounded), so it does **not** count as "slow"; instead it pushes the node toward the
   **GROUND** check (is the symbol meaningful?) rather than DRILL. Trust a latency reading
   only when the probe's accuracy is reasonable.
6. **Interaction with ground/drill criteria** — routing in §5; a remediating/located node
   is excluded from its dependents' unlock/rate-gate pressure until fluent.
7. **Interaction with existing retreat / reach-up** — diagnostic is a **separate** mode.
   Precedence: an active session **owns** selection for its probe/remediation items;
   reach-up and the two-miss retreat are suspended for those target skills (steady-state
   continues elsewhere). The fluency trigger is orthogonal to the accuracy retreat — a
   child can be accurate (no retreat) yet slow (diagnostic).
8. **Uniformly-slow-but-fluent child** — the absolute floor uses the child's *measured*
   writing speed, so their higher baseline is expected and not flagged; only genuine
   outliers relative to their own fluent skills (or beyond the generous absolute bar)
   trigger.
9. **Latency noise (device/network/distraction)** — median (robust), winsorize,
   first-try-correct only, compare to own baseline; AFK cap. Never trigger on one item.

---

## 8. Integration points

1. **Skill graph** (`src/skills.ts`): descent uses `ancestors(S)`, `requires`, and a
   cached per-node topo `rank`. Add static `complexity(k)`, `writeChars(k)` (or derive
   from `features.ts`/canonical item).
2. **Rating system** (`src/model/elo.ts`, `ability`, `rate`/`rate_state`/`aim`): the
   confirming sprint and the DRILL criterion reuse the **existing** sprint→rate→`aim`
   gate unchanged. The descent's fluency belief is a **separate ephemeral high-K
   estimate** off `latency_ms`; it never writes θ/rate beyond the normal attempt/sprint
   replay. Steady-state θ/rate dynamics are not modified (req #1).
3. **Selection loop** (`nextItem` in `src/lib/practice.ts`, `/api/next`): add a
   **diagnostic branch at the top** of selection — if the child has an active session,
   the diagnostic controller supplies the next item (probe of `M` / remediation of `R`),
   bypassing the normal selector *for that item only*; otherwise the selector runs
   **unchanged**. The **trigger check** lives in the answer path (`answer()`): after each
   first-try-correct attempt, update the per-skill struggle streak and, if it crosses
   `TRIGGER_N` with no active session and no cooldown, emit `DIAG_OPENED`.
4. **Ground/Drill progression** (deferred): the route emits the typed
   `{ node, phase:'ground'|'drill', evidence }` handoff. Only `drill` is wired today;
   `ground` emits `needsGrounding` (parent flag) until the GROUND subsystem consumes it.
5. **Parent view**: gentle outcomes only — "we sharpened [skill] for [child]"
   (resolved) or "[skill] needs a look" (floor). Never a level or "behind."
6. **Child UX / framing**: probes + remediation are ordinary-looking items introduced
   as "let's make these lightning-fast." The child never sees "diagnostic," "gap,"
   "behind," or a number (invariant).

Total diagnostic cost: ~6–12 probe items (all at *easier*, mostly-correct foundational
skills) + 1 sprint per root, `O(log depth)` — fast relocation with minimal failure
exposure (a wellbeing requirement, req/invariant).

---

## 9. Tunable constants (start here; validate on real usage)

| name | meaning | start |
|---|---|---|
| `TRIGGER_N` / `TRIGGER_W` | slow first-try-correct to enter, of last W | 3 of 4 |
| `Zslow` | personal-baseline multiplier for "slow" (trigger) | 1.8× |
| `Zprobe` | personal-baseline multiplier for a probe node's bar | 1.6× |
| `Kfluent` | fluent-answer margin over pure write time (absolute floor) | 2.5× |
| winsor cap | latency outlier / AFK exclusion | 5× median |
| probe items | per node | 2, +1 if split (max 3) |
| `G` | accurate first-try attempts ⇒ grounded | 5 |
| `K` (roots) | max simultaneous roots remediated | 2 |
| `MAX_REMEDIATION` | sprints/sessions before FLOOR | 4 |
| cooldown | per-skill re-trigger suppression after resolve | ~5 sessions |
| resolve stability | fresh sprints at/above aim to hand back | 2 (or celeration ≥ 0) |

---

## 10. Invariant checklist

- [x] **Fluency (rate/latency), not accuracy, is the detector** — trigger + probe are
  latency/rate; accuracy failures route to grounding, not to "slow."
- [x] **Steady-state loop stays untouched** — diagnostic is a separate mode + separate
  high-K estimate; the selector, θ, and rate dynamics are unchanged when no session is
  active, and are never made to drop faster.
- [x] **Minimize failure exposure** — `O(log depth)` relocation over *easier*,
  mostly-correct probes; no long failing crawl.
- [x] **Framing "sharpen these 2," never "you're behind"** — child sees ordinary items;
  outcomes surface (gently) to the parent only.
