# Start-from-below: placement for the kids this is actually for

Extends and, where they conflict, **overrides** `onboarding-ramp.md`,
`ui-lifecycle.md` §4.3 (create-player / grade), and `handoff.md` §2 (seed).

> **Update (`fix-remove-probe.md`):** this document assumed the child's first
> experience was a start-from-below practice session, but a forced baseline probe
> (`evidence-and-theses.md` §2.3) was sitting in front of it and cost a behind
> child his whole first session. That probe is now off the child's path entirely
> (parent-initiated only). "Win first" is now literally the first thing a new
> child meets — nothing measurement-shaped precedes it.

This document exists because of one observed session. A kid who is behind in
maths and knows it, who gets that failure several times a week in class, walked
up to celerant *curious and wanting to genuinely try* — and the tool started him
too hard, he pressed "vet inte" and guessed and got several wrong in a row, said
"I'm fine," found a distraction, and left. He failed first. For this child, the
tool became the billionth thing that confirmed *I'm bad at this*.

That is the exact failure celerant exists to prevent, and it happened on first
contact. The design target is not math-positive kids — the world already has a
billion things for them. It is the kid who fails daily and stays curious anyway.
Build for him, or there is no reason to build.

The principle, from which everything below follows:

> **A child who is behind must win before the system probes, and must never
> have to declare his own level.**

---

## 1. What went wrong, precisely

Three compounding faults, in order of damage:

1. **He failed first.** The seed started him near a grade-derived level; his real
   level was below it; so his opening problems were misses. For a confident kid,
   opening misses are a calibration annoyance. For a behind-and-ashamed kid, they
   are *evidence about himself*, because that interpretation is already loaded.
   The tool didn't stay neutral and miscalibrate — it actively delivered the
   confirmation he was primed to receive.

2. **He had to declare his grade.** Asking a kid who is behind to pick his grade
   is asking him to self-report status in the domain he feels worst about. He
   picks high to save face (and then fails his own claim), or low in defeat. Both
   are loaded, both bad.

3. **The approach direction was downward.** Seed-then-adjust-down means the app
   gets *easier after he fails*, which reads as "it noticed I couldn't do it."
   Start-low-and-climb means the app finds his level *from below*, by watching
   where wins stop — same final calibration, opposite psychological sign.

Grade-based seeding is structurally wrong for exactly the children who most need
the tool, because grade encodes the expectation they are already failing to meet.

---

## 2. Start from below — the core change

Replace the grade-derived starting point with a **low floor and a slow climb**,
for every new player, and never approach the level from above.

- **The floor is genuinely easy.** The first problems target ~0.95 predicted
  success and should feel, to any child, obviously doable. Not one or two warm-up
  items (as `onboarding-ramp.md` had it) — **enough consecutive wins that the
  child feels competent before the system probes upward.** Bank the wins first.
- **Climb slowly, from below.** Difficulty rises only as the child keeps
  succeeding. The system finds the edge by climbing *into* it from underneath —
  the first miss or hesitation marks approximately where to settle — never by
  starting above and dropping.
- **Settle low at first.** For a new player, the initial target success rate is
  **~0.90, not 0.80.** A child rebuilding the belief that he can do this needs
  the win ratio to feel high. Tighten toward 0.80 later, per §4, once he is not
  fragile. Early on, confidence repair and calibration want different numbers,
  and confidence wins.

This generalises the onboarding ramp: for confident kids it costs a few extra
easy problems they'll breeze through (harmless). For behind kids it is the whole
difference between a first session of wins and a first session of failure.

---

## 3. Don't make the child declare a grade

- **The child never picks a grade.** Remove grade selection from the child-facing
  create-player flow entirely.
- **The parent may set a grade privately**, out of the child's sight, as a *weak
  hint only* — it nudges where the climb *starts* from below, never where it
  *lands*. A parent-set grade must not be able to place the first problem above
  the easy floor. It can only make the floor slightly less low for a kid the
  parent knows is ahead; it can never raise the child into failure.
- **Date-correct the hint.** From roughly 1 June to mid-August (Swedish school
  year turns over in late August), a grade the parent names is the grade the child
  is *entering*; seed the hint from grade-minus-one. Before that turnover, "grade
  3" means "finished grade 2."
- If no grade is given, start from the global easy floor and let the climb do all
  the work. This must be a fully supported path — a parent should be able to skip
  the grade entirely and get a good result.

The climb finds the real level regardless of the hint. The hint only saves a
confident kid a few trivially easy openers. It can never cost a behind kid a win.

---

## 4. The climb *is* the placement — no rank, ever

This is the SC2-placement idea, kept and de-fanged. A short run of problems
rapidly finds the child's level via the estimator, exactly as placement matches
converge you to a rank in a few games — but **there is no rank, no division, no
badge, no visible level at the end.** SC2 placement produces a status verdict;
this produces only a quiet, correct starting difficulty the child never sees.

- Run the climb with **wide RD** (high plasticity) so a handful of answers move θ
  fast and the level settles in the first several items. Glicko's RD makes this
  natural — start uncertain, let success collapse the uncertainty from below.
- The child experiences it as "the first few questions start easy and find where
  I should be." Nothing on screen names a level, a rank, or a result.
- After the climb settles, hand off to the normal selector — but hold the target
  at ~0.90 for a new/fragile player and ease it toward 0.80 over subsequent
  sessions as volatility drops and wins stay steady. A kid who is consistently
  winning can take more challenge; a kid still swinging cannot.

The honesty rules from `onboarding-ramp.md` §4 still bind: easy *successes* update
θ weakly (they're uninformative — he was meant to get them); an unexpected *miss*
on an easy item updates fully (it's real and surprising); the whole climb is
reproduced by replay; climb items are flagged and excluded from probe/evidence
analyses. Starting from below changes *what he sees and how it feels*, never what
the system honestly believes.

---

## 5. "vet inte" and guessing, for the fragile kid

He pressed "vet inte," then guessed, then got them wrong. Two things follow:

- **If the floor is right, he should rarely reach for "vet inte" in the opening**,
  because the opening is winnable. The best fix for the "vet inte → guess → wrong"
  spiral is that he never gets into it, because he's winning. Start-from-below is
  the primary fix here too.
- **A wrong guess early must not spiral.** If a new player misses two in a row
  during the opening climb, the floor was still too high for him — **drop back
  down** to easier items and rebuild the win streak before climbing again. Never
  let a fragile kid accumulate consecutive misses in his first session; the
  moment the system sees two, it retreats to safe ground. This is the opposite of
  the current behaviour, which held him at the hard level after he failed.

---

## 6. What this costs the confident kid — almost nothing

A math-positive kid (his sister) starting from below gets a handful of easy
problems she solves instantly, the climb settles her quickly at her real edge,
and she's into real work within a session. The cost is a few trivial openers she
enjoys anyway. There is no version of this that hurts the confident kid, and
there is every version of the old design that hurts the behind kid. The asymmetry
is the whole argument: **optimise the floor for the fragile, because the ceiling
takes care of the confident.**

---

## 7. Acceptance

- A new player's first item targets ~0.95 success at their starting θ, regardless
  of any parent-set grade. Assert across grades and the no-grade path.
- No child-facing flow asks the child to select a grade. Grep the create-player
  UI.
- A parent-set grade can lower how many easy openers appear but can never place
  the first item above the easy floor. Assert: first-item predicted success ≥ 0.9
  for every grade hint.
- Date logic: a grade entered in July seeds from grade-minus-one. Test at a July
  date and a September date.
- Two consecutive misses in the opening climb trigger a retreat to easier items,
  not a hold at level. Assert on a simulated behind-kid whose true level is below
  the floor.
- New-player target success starts ~0.90 and eases toward 0.80 only as volatility
  drops across sessions. Snapshot the target over a simulated steady-winning
  player's first several sessions.
- Everything in §4's honesty rules holds: θ after a start-from-below session
  equals θ after the same answers served flat, given the weak-update rule. This
  proves the kinder opening still can't corrupt the instrument.

---

## 8. The thing the spec can't do

This fixes the tool for the *next* behind kid who walks up curious. It does not
fix the session that already happened, and it is not meant to. The boy who left
saying "I'm fine" comes back to the app later, if at all, and only once it's the
start-from-below version — and the repair of *his* relationship to maths happens
off-screen, with a parent, in some low-stakes place that isn't the scene of the
failure, long before the app is the right instrument for him again.

Build this so the next curious kid who is behind gets a first session of wins.
That is the entire job.
