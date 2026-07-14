# Celerant — Cat Collection Reward Layer (Spec v2)

## Purpose
A cooperative, always-additive reward space. Kids complete practice sessions and **direct
each completed session** toward a target they care about — a specific mathematician cat, the
family cooperative goal, or (later) a piece of cat furniture. When a target reaches its cost,
it resolves: the cat appears (permanently) in one shared room and wanders; the family goal is
met; the prop is placed. The room's cats do cat things and can be petted.

## Design principles (inherited — must hold)
- **Session-contingent, flat.** Reward is per *completed session*, never per answer, never streak-based.
- **Shared & additive.** One shared room; every unlock is permanent and benefits everyone. No consumption that denies another kid. No ownership of cats, no rivalry.
- **Always-happy pet.** No wellbeing gauge, no needs, no decay. Petting is meter-free delight.
- **Separate visual register.** Pixel-art room, kept apart from the Apple-minimal practice UI.
- **Finite roster, endless horizon.** Completion is never required; unfinished is fine.

## Core model — directed sessions toward targets
Every reward in the system is a **target**. A completed session is **allocated** to exactly
one target by the kid who earned it. A target resolves when its accumulated allocations reach
its cost.

Target kinds:
- **cat** — the 10 mega-famous roster. Cost: **20 sessions each** (flat, no free starter).
- **family** — the family cooperative goal. Just another target; its own cost.
- **prop** — cat furniture (fixed-slot). Deferred to the next spec; same model.

This unifies cats, the family goal, and props into one mechanism: *sessions accumulate toward
targets; a target completes at its cost.*

### Allocation
- At session end, the kid picks where it counts. One tap, not a menu.
- There is a **current shared target** (set by the family — "let's all collect for
  Pythagoras"). It is the **default** for every session, so a kid who just finishes flows
  their session there with no extra decision. This keeps it frictionless for the youngest.
- Any kid may override their own session's target (a different cat, or the family goal).
- **Convergence is the accelerator.** With three kids all defaulting to Pythagoras, 20 is
  ~a week of family focus. Split some sessions to the family goal and the cat comes slower —
  by choice.

### Opportunity cost (intended)
A session spent on a cat is *not* spent on the family goal. That trade-off is the point: it
makes allocation a real family decision and keeps the family goal continuously in play as the
always-available alternative, rather than something the cats sit on top of.

## Data model (fits the append-only ledger + replay)
Extend the existing session-completion record with an allocation target:
```ts
type Target = { kind: 'cat' | 'family' | 'prop'; id: string };

// SESSION_COMPLETED already exists; carry the allocation on it (or as a paired event):
type RewardEvent =
  | { type: 'SESSION_COMPLETED'; memberId: string; target: Target; ts: string }
  | { type: 'SHARED_TARGET_SET'; target: Target; ts: string }; // current family default
```

Static content (in code, not the ledger), locale-keyed:
```ts
type RosterItem = {
  id: string;                       // locale-independent, e.g. 'pythagoras'
  kind: 'cat' | 'prop';
  spriteId: string;                 // ToffeeCraft sprite / slot id
  cost: number;                     // sessions; cats = 20
  order: number;                    // default display order (not a hard gate)
  name:  Record<Locale, string>;
  blurb: Record<Locale, string>;    // one-line "who/what" shown on tap
  slot?: { x: number; y: number };  // prop only: fixed position
};
```

Derived cache (rebuilt by `replay()`, idempotent):
```ts
type RewardState = {
  progress:      Record<string, number>;  // targetId -> allocated session count
  unlockedCats:  string[];                 // cat ids where progress >= cost, ordered
  sharedTarget?: Target;                   // latest SHARED_TARGET_SET (if unresolved)
};
```

## Replay reducer (sketch)
- `progress[t.id] = count(SESSION_COMPLETED where target.id === t.id)`
- a cat is **unlocked** iff `progress[catId] >= roster[catId].cost` (20)
- the family goal is **met** iff `progress['family'] >= familyGoalCost`
- `sharedTarget = last SHARED_TARGET_SET.target` (if still unresolved, else first unresolved by order)

Counting directed sessions is idempotent, so replay-idempotency holds. No explicit unlock
event is needed — unlock is a pure function of the directed count.

## UI surface
- **End-of-session tap:** "Where should this count?" defaulting to the shared target; one tap to confirm, one more to redirect. Show the target's progress ticking up (e.g. Pythagoras 14 → 15 / 20).
- **Room:** one shared pixel room, fixed background.
  - Cats: for each unlocked cat, spawn a wanderer — state machine over `{idle, idle2, sit, sleep, walk}`, random dwell + walk targets, z-sort by y. Tap → name + blurb + heart-popup (petting). No needs, no timers.
  - Props: rendered at fixed `slot.{x,y}` once unlocked (next spec).
- **Approach cue (first cat especially):** show a closed cat carrier/box + a progress meter from session one, so the first ~20 directed sessions read as a visible climb, not an empty room; the cat emerges from the box on completion.
- **Target board:** the roster + family goal with each one's progress and cost; a "set as our target" action for the shared default.

## Cat roster — mega-famous 10 (cost 20 each)
| # | id | EN | SV | one-line hook (blurb, EN) |
|---|----|----|----|---------------------------|
| 1 | pythagoras  | Pythagoras   | Pythagoras   | the a²+b²=c² triangle rule |
| 2 | euclid      | Euclid       | Euklides     | the geometry of the *Elements* — points, lines, proofs |
| 3 | archimedes  | Archimedes   | Arkimedes    | π, circles and spheres, "Eureka!" |
| 4 | fibonacci   | Fibonacci    | Fibonacci    | the 1, 1, 2, 3, 5, 8… sequence in nature |
| 5 | alkhwarizmi | al-Khwarizmi | al-Khwarizmi | gave us the word *algebra* — solving for x |
| 6 | descartes   | Descartes    | Descartes    | the (x, y) coordinate plane |
| 7 | pascal      | Pascal       | Pascal       | Pascal's triangle and the start of probability |
| 8 | newton      | Newton       | Newton       | gravity and the calculus of change |
| 9 | euler       | Euler        | Euler        | the Königsberg bridges; the number *e* |
| 10| gauss       | Gauss        | Gauss        | added 1…100 in seconds as a schoolboy |

Localized spelling deltas: **only** Euclid→Euklides and Archimedes→Arkimedes. Swedish `blurb`
strings are a translation task; names are locked.

## Asset task
Ten cats need ten distinct sprites. The ToffeeCraft pack ships ~8 non-themed variants; produce
**2 recolors** in the pack's style to reach ten, one fixed sprite per cat id. Hold every sprite
to the same on-screen pixel scale (nearest-neighbor).

## Out of scope (this version)
- Furniture/prop slot list + positions (next spec) — same target model, `kind: 'prop'`.
- Seasonal/themed refresh sets.
- Any per-answer or performance-linked reward — explicitly excluded.
