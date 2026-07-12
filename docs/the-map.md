# The map

Extends `motivation.md` §3.4 (the card shelf) and `handoff.md` (the skill
graph). This does not add data — it renders data you already have. `skills.ts`
is a 77-node prerequisite DAG; the card shelf is the set of nodes a child has
reached. This spec lays the shelf out *as the graph* and fogs everything the
child hasn't earned.

Read §2 before building. The whole design is one decision — what the child may
see — and getting it wrong rebuilds the contingent-self-worth trap that §3.4 of
`motivation.md` exists to prevent.

---

## 1. What we're taking, and what we're refusing

The pleasure of the Civilization tech tree comes from four things:

- **legibility** — you see the shape, and where you are in it;
- **the reveal** — fog lifting off territory you earned;
- **deliberate progress** — you chose this path;
- **anticipation** — you can see a distant node and want it.

Take the first three. **Refuse the fourth**, for the child.

Anticipation is what makes Civ compelling *and* it is the one mechanic that
turns this map into a way to feel behind. Every Civ node is reachable this
session; yours span years. A child who can see `lin_paren_both_sides` glowing
eight nodes away has been handed a progress bar toward "good at maths," and the
first hard problem then threatens an identity they can see themselves failing to
reach. Long-range visibility is the trap. Local visibility is the pleasure.

---

## 2. The three rings, and the fog

The child sees exactly three bands of the graph. Everything else is fog.

1. **Reached** — skills with a card. Rendered solid: the card itself, in its
   true position in the graph, edges drawn to its prerequisites. This is the
   territory crossed. It sits *behind* the frontier.
2. **Frontier** — skills unlockable right now (all `requires` satisfied).
   Rendered glowing, empty-framed. **These are exactly the three-way choice from
   `motivation.md` §3.2** — the map and the chooser are the same object. A child
   picking their next skill is choosing where on the map to go next.
3. **The near ring** — skills whose prerequisites are all either reached or on
   the frontier: one step beyond reach. Rendered as **silhouettes**. You can see
   something is there. You cannot see what it is.

Beyond the near ring: **fog**. Not greyed nodes, not locked icons with a
padlock — absence. The child cannot see how many nodes remain, cannot see the
shape of what's coming, cannot count the distance to anything. The horizon is
dark.

```
   [reached]──[reached]──●frontier●
        │                    ┊
   [reached]──●frontier●   (silhouette)
        │          ┊
   [reached]   (silhouette)      · · · fog · · ·
```

### Why silhouettes at all

One ring of silhouette, and no more, because a frontier with nothing beyond it
reads as an edge — "this is where the world stops." A single ring of shapes says
"there is more, and you're moving toward it" without letting the child measure
how much. It is the fog *at its edge*, not the fog lifted.

---

## 3. This replaces the shelf; it is not a second screen

`motivation.md` §3.4 put the cards on a shelf. Make the shelf *be* the map.
There is one artifact behind the child's icon, not two.

The consequence is the whole point: a plain shelf is a list of trophies, and a
list invites "how many are there in total?" — which is a deficit. A **map** has
completed territory behind you and fog ahead, and reads as *look how far I've
come*, because the crossed ground is what's visible and the uncrossed ground is
a place, not a number.

Same cards. Same data. The layout changes what the child feels when they look at
it, from *how much is left* to *how far I've come*.

---

## 4. The reveal

When a skill unlocks, its **silhouette resolves into a card** — the child's own
first solved problem of that type, per §3.4. That resolution *is* the Civ fog
lifting, and it is ungameable: you cannot uncover the map without genuinely
reaching the node, which requires the prerequisites accurate and (for
components) fluent.

The animation is the one already permitted everywhere else: a 200ms opacity
transition, silhouette → card. No burst, no sound, no "NEW TECH UNLOCKED"
banner. The card appearing on the map is the whole event.

A newly-reached node also shifts a fresh silhouette into view beyond it — the
frontier advances by one, the fog recedes by one node. That quiet advance is the
sense of movement, and it costs nothing because it falls out of the graph.

---

## 5. Refuse, explicitly

| forbidden | why |
|---|---|
| showing any node beyond the near ring | the anticipation trap; a visible distant goal is a measurable deficit |
| **path highlighting** ("to reach X, do Y then Z") | turns the map into a checklist against a far goal — anticipation in its purest form |
| a total node count, a percentage complete, "62 of 77" | a progress bar toward "good at maths" is the contingent-self-worth trap |
| padlock icons, greyed named nodes, "coming soon" | these show the child what they can't do yet, by name; fog is absence, not a locked door |
| rarity, colour-by-difficulty, gold nodes | the icon-set rule again: no node is better than another |
| distance/ETA to any node | never let the child measure the mountain |

The rule in one line: **the child can always see their next step, and never
their tenth.**

---

## 6. The parent view sees everything

The parent gets the full graph, unfogged: reached, frontier, and all 77 nodes in
their true positions, edges drawn. No silhouettes, no fog.

This is your instrument, not a report card — same principle as
`ui-lifecycle.md` §4.6. And `handoff.md` §7's two bug-detectors read more
clearly against the full graph: a node whose accuracy collapsed right after
unlocking is visible in context, with its prerequisite edges right there to
inspect. The detectors still fire as sentences (per the earlier correction); the
full map is where you go to see *why* one fired.

---

## 7. Layout

The graph is a DAG with natural depth (tier 1 at the root, linear equations at
the leaves). Lay it out by longest-path depth left-to-right, or top-to-bottom on
a phone. Within a tier, group by `family` (the field is already in `skills.ts`)
so multiplication clusters, negatives cluster, fractions cluster — the child
learns the shape of the subject, not just their path through it.

Positions must be **stable**: a node sits in the same place before and after it's
reached, so the map is a territory the child comes to know, not a layout that
reshuffles. Compute positions from the graph alone, never from which nodes are
currently reached.

The frontier is always visible without scrolling — the child should never have
to hunt for their next step. The reached territory can extend off-screen behind
them; that's the point, it's a lot of ground and they can scroll back through it.

---

## 8. Acceptance

- A child sees: their cards in graph position, a glowing frontier, one ring of
  silhouettes, then nothing. Assert no node beyond the near ring is present in
  the child's map payload — not hidden in CSS, *absent from the response*.
- The frontier set equals the three-way choice set from `motivation.md` §3.2.
  Same query, asserted equal.
- Node positions are identical before and after a node is reached. Snapshot test.
- Unlocking a node resolves exactly one silhouette to a card and reveals at most
  the silhouettes newly one-step-away. No other node changes state.
- The child's map payload contains no total count, no percentage, no distance
  field. Grep the response.
- The parent map payload contains all 77 nodes. The child map payload never does.
- Dropping the `card` table blanks the map and changes no θ. The map is strictly
  downstream of the model (per `motivation.md` §5).
