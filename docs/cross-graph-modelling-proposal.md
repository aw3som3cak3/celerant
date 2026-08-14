# Suggestion: cross-graph modelling — the apex of the composition tier

Status: PROPOSAL (2026-08-14), for review — not a spec, not built. It sketches where the
math-modelling first slice (`/model-demo`) grows toward the "police-quest / capture-the-flag"
vision: composition problems that draw on **maths + Swedish + English at once**.

## 1. What it is
The modelling slice proved single-subject composition: a situation, the child mathematises it,
the scene validates the answer. Cross-graph modelling is the **top of that tier** — a short
**quest that chains steps, each exercising a different fluency**, woven into one meaningful task:

```
read a Swedish clue        (reading fluency)
  → it names an English word you must recognise   (English fluency)
    → which gives a number you compute with        (maths fluency)
      → the result unlocks the next clue …
```

The child already owns every *step* (each is a recognition or a fact she's fluent on). **The new
skill is the composition** — holding the thread, deciding what each step needs, carrying a result
from one fluency to the next. That is genuine application/adduction, and it is exactly why
fluency is worth building: the quest is the *payoff* for having made the parts automatic.

## 2. Why it's the right apex
- It's the fullest expression of the instructional hierarchy: fluent components, from *all three
  graphs*, composed into something no single graph could ask.
- It makes cross-subject fluency **pay off visibly** — "why learn to read?" is answered by *you
  can now do the reading-clue quest*. It is the motivational core the kids will feel, precisely
  because it is meaning, not a badge (see the guardrail below).
- It is the most game-like surface celerant would have — and the safest place to be game-like,
  because the "game" is that the *problem is real*, not that solving it earns a token.

## 3. Mechanics (grounded, A11-safe)
- **A `QuestStage` that SEQUENCES existing stages** — ChoiceStage for a recognition step, the
  numpad for a maths step, ModelStage for a modelling step — threading a narrative + the running
  result between them. This is a composition-layer *orchestrator*, exactly as `AcquisitionStage`
  sequences sub-steps. **No new engine**; reuse every surface.
- **Deeply cross-subject-gated.** A quest carries `crossRequires` spanning *every* fluency it
  uses (`READING_READY` + the English recognition rungs + the maths components). A child reaches
  a quest only when fluent across its subjects — that gate is not a limitation, it *is the point*:
  the quest is the apex a child climbs to. (This is the cross-subject-gating principle at full
  stretch.)
- **Non-punitive, self-validating.** The quest advances on a right step and simply waits on a
  wrong one — never a red X. The narrative validates structurally: a clue only makes sense if the
  previous step was right, so an error is visible as *the story not fitting*, like the pizza scene.
- **θ-inert, like modelling.** The quest is application — a different construct — and feeds no θ.
  (Open choice: whether the *component steps inside it* feed their own θ, since she is practising
  them. Recommendation: no — keep the whole quest a clean, unmeasured application surface, and
  let the components be measured in ordinary practice.)
- **Authored, parameterised templates.** A quest is a *crafted chain*, not a generated item — the
  narrative structure is fixed, the numbers/words vary by seed. So the content model is a small
  library of quest templates, more authoring-heavy than generated maths. Start with **one**.

## 4. First slice (prove it small)
**One two-graph quest — maths + Swedish reading**, 3–4 chained steps, linear (it hand-holds each
step), narrative-validated. Prove the three hard things on ONE quest before a library or a third
graph: the `QuestStage` sequencer over mixed surfaces, the deep cross-gate, and the non-punitive
"advance-or-wait" progression. English (the third graph) is the *next* step, not the first.

## 5. Sequence & guardrails
1. Two-graph quest (maths + reading), linear. ← first slice
2. Three-graph quest (add English recognition as a step).
3. Openness (grade it like modelling): early quests hand-hold *which* fluency each step needs;
   later ones make deciding-what-each-step-needs the challenge (a Fermi-quest).

Guardrails, non-negotiable: **meaning, not reward** (no points/streaks/badges — the quest is the
motivation); **cross-gated** (never handed to a child who lacks a fluency it uses); **θ-inert**
(application, not a measured drill); **non-punitive** (advance-or-wait, never a red X).

## 6. Honest risks
- **Authoring cost.** Quests are crafted narratives; they don't generate themselves like
  arithmetic. This is the real constraint — a rich library is real writing work. Prove the shape
  on one before committing to a library.
- **Reach.** The deep cross-gate means few kids reach a quest soon — correct (it's the apex), but
  it means impact is delayed and the payoff is for the *fluent* child, not the struggling one.
  Cross-graph is the reward at the top, not a teaching tool for the bottom.
- **The game/learning line.** Every step must carry a real fluency; the moment narrative padding
  outweighs the maths/reading/English, it's a game with homework bolted on. Keep the fluency
  density high — story in service of the composition, never the reverse.

## 7. Recommendation
Worth building, *after* the single-subject modelling tier has a bit more depth (a couple more
scenarios beyond pizza) so the `QuestStage` has proven surfaces to sequence. The first concrete
step is a **spec** for the two-graph first slice — the QuestStage contract, the cross-gate, one
authored quest — written the way the modelling and acquisition specs were. Say the word and I'll
write it (or hand it to the composition agent, which owns the modelling surface).
