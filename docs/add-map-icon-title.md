# Three small additions: reachable map, editable icon, real tab title

Three changes. #1 has design subtlety and needs care; #2 and #3 are small. Read
#1's reasoning before building — the map is easy to get subtly wrong in a way
that quietly undoes earlier design work.

Extends `the-map.md`, `motivation.md` §3.4, `ui-lifecycle.md` §5.2.

---

## 1. Make the map reachable from the child's own screen

Right now a child can only glimpse the map/cards in the moment just after a
session ends. Make it reachable any time, from the child's own space (behind
their icon) — **but preserve everything that made it safe.**

### What the map is

Not a trophy shelf (pure backward-looking). It's the three-part thing:
**"I just mastered this / here's where I am / here's where I'm going."** The third
part is the reason to give access and also the only risk, because "where I'm
going" flips from motivating to demoralising depending on how much of it a child
can see.

### The rules that must hold — do not re-open these

- **Serve the CHILD map payload, fogged — never the parent map.** Reached nodes
  solid, the frontier glowing at the edge, **one** ring of silhouettes beyond,
  then **fog = absence** (nodes literally not in the payload, not CSS-hidden).
  This is `the-map.md` §2 and §8. A visitable map is one the child will *study*,
  so the full-graph leak the parent map would cause is worse here than at
  session-end. Assert: the child-reachable map payload contains only reached +
  frontier + one silhouette ring; never all 77 nodes; no total count, no percent,
  no distance-to-node field.
- **The fog is load-bearing.** It is *why* "where I'm going" reads as *the next
  step* and not *the mountain*. A behind kid who could see the whole ladder to
  year 9 would feel the deficit, not the momentum. Keep exactly one silhouette
  ring. Do not add a second, do not reveal names beyond the frontier, do not show
  how far there is to go.
- **Practice stays the primary action on that screen.** The map is a place the
  child *glances at on the way to doing*, not a destination that competes with
  practice. Tapping the child's icon should lead naturally to *start a session*,
  with the map reachable as a secondary look-back/look-ahead view — not the other
  way round.
- **The only way to add to the map is to practise.** The map must not become
  interactive in any way that lets a child change it without practising — no
  rearranging, no tapping to "explore," no minigame. It's a record you look at,
  not a thing you play. Browsing it is harmless precisely because it's inert.

### Keep it calm

No animation beyond the existing 200ms opacity transition. No "NEW!", no counter
of cards-until-next-region, no fanfare when opened. Reachable, quiet, his — a
place to see *I did this* and *there's a next thing just there*, not a place that
performs at the child. Flashiness would convert the quiet record into exactly the
reward machinery the design refuses.

### The silhouette is an invitation

A frontier glowing at the child's edge and one silhouette just beyond is the app
saying "you're almost at something new" — and the only way to turn a silhouette
into a real card is to practise into it. For a kid used to maths being a wall,
that's the intended pull: the map makes him want the next rung, and the rung is
only reachable through practice.

### Watch-item (note in the code/README, not a feature)

After this ships, the signal that tells us it was right: **session counts hold or
rise** while the map is browsable. If session counts *drop* while map-visits
rise, the map became a destination that substitutes for practice, and access
should be pulled back toward session-end only. It almost certainly won't — the map
is inert, not a game — but it's the thing to watch.

---

## 2. Let a child change their own icon

A child changing their own icon is low-stakes — it's an icon, not identity that
affects anything in the model. `ui-lifecycle.md` §5.2 already allows
`PATCH /player/:id/icon` for the child.

- From the child's own space, let them pick a new icon from the full set, minus
  icons already used by other players in the same family (the within-family
  uniqueness constraint still holds — `UNIQUE(family_id, icon)`).
- No PIN required for the child to change their *own* icon; it's their space and
  their icon. (Changing *another* player's icon, or anything else, still isn't
  reachable from a child's screen.)
- The icon is a `key` stored in the DB; the change is a simple update, and it
  touches nothing in the model — no θ, no cards, no map. The card shelf and map
  are keyed on player_id, so they follow the child across an icon change
  untouched. Assert: changing a child's icon leaves their attempts, cards, θ, and
  map identical.
- Same grid UI as create-player: category tabs, large tap targets, taken icons
  absent. No search on the child's screen (search is parent-only, per
  `ui-lifecycle.md` §3.3).

---

## 3. Fix the browser tab title

The tab currently reads "practice" (the route name leaking into the title). Set a
proper document title.

- App-wide default: **Celerant** (or "celerant" — match the wordmark used in the
  README/UI).
- Don't leak route names into the tab. The child-facing screens especially should
  never show "practice" as a title; if a per-screen title is used at all, keep it
  the app name. A six-year-old's parent seeing "practice" in the tab is a small
  broken-feeling detail; the app name is the fix.
- Check the manifest/head metadata too, so if the app is later added to a home
  screen (PWA), the name shown is "Celerant", not "practice".

---

## 4. Acceptance

- The child-reachable map payload is the fogged child map: reached + frontier +
  one silhouette ring only; never all 77 nodes; no count/percent/distance field.
  Assert (same as `the-map.md` §8, now also on the reachable-from-own-screen
  path).
- Practice is the primary action on the child's screen; the map is secondary.
- The map is inert — no route lets a child alter it without practising. Grep for
  any write path from the map UI.
- A child can change their own icon from their own screen, no PIN, subject to
  within-family uniqueness; doing so leaves θ, cards, and map identical. Assert.
- The browser tab reads the app name, not "practice", on every screen including
  child screens and the create/login flow. Check the manifest name too.
- No new animation, counter, or fanfare on the map or the icon-change screen.

---

## 5. Why #1 is worth the care

The map is the one place the austere, reward-free design lets a child feel *look
how far I've come* — and for the kid who least believes he can do maths, that
evidence is the most valuable thing in the app. Making it reachable is giving him
the medicine the current design only shows for two seconds. But the same view,
unfogged or gamified or made a destination, becomes a deficit-measure or a
practice-substitute. The care is entirely in keeping it fogged, calm, inert, and
secondary to practice. Get those four right and it's pure upside for exactly the
children this tool is for.
