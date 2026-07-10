# Motivation

Extends `agent-brief.md` §10 (non-goals), `fluency-addendum.md`,
`ui-lifecycle.md`. This document **relaxes** the original blanket prohibition
on motivational mechanics, and replaces it with a sharper one. Read §1 before
building anything in §3.

The original brief said: no points, no badges, no streaks. That was right about
the mechanisms and wrong to imply nothing may exist. What follows is what may
exist, why, and — more importantly — why the obvious version is forbidden.

---

## 1. The constraint that is not a value judgement

**Never make any reward contingent on answering correctly.**

Not "we'd rather not." It breaks the system, mechanically.

θ is inferred from whether the child beats the model's prediction. That
inference assumes the child is trying to *solve the problem*. A child rewarded
per correct answer is solving a different problem — maximise corrects — and the
optimal strategy for that problem is:

- guess rather than press **vet inte** (a guess is uncorrelated with ability and
  poisons θ far worse than an honest wrong answer);
- prefer `mult_table_2` over `mult_table_7`;
- avoid every skill near the edge of competence, which is exactly the set the
  selector exists to serve.

Each of those inflates θ while teaching nothing. The unlock gate then fires on
fictional ability, and the fluency logic gates on fictional accuracy. You would
be paying the children to corrupt the instrument you built to see them with.

**The canary:** the `vet inte` rate. If it approaches zero after any change to
incentives, the instrument is already broken. Void that period, replay, and
remove whatever you added.

Deci, Koestner & Ryan (1999) found the undermining effect of extrinsic reward is
strongest for exactly this case — *expected, tangible, performance-contingent*.
Cameron & Pierce dispute the magnitude; the sign is not disputed. Verbal
feedback does not undermine. Rewards uncoupled from performance barely do.

---

## 2. What is forbidden, and why each one specifically

| forbidden | reason |
|---|---|
| payment or points per correct answer | §1. Breaks θ. |
| **streaks** of any kind | Octalysis Core Drive 8, Loss & Avoidance — black hat by Chou's own taxonomy. Produces urgency, then churn. Also punishes a child for being ill or going fishing. |
| rewards for **time on task** | Time is the one quantity fakeable by staring at the screen. |
| badges, XP, levels, coins, gems | A badge is a *verdict on the person*. See §4. |
| rarity, tiers, gold/silver/bronze | Reintroduces the status gradient the icon set was curated to eliminate. |
| leaderboards, sibling comparison | Do not build the query. |
| notifications, reminders, "du har inte övat på 3 dagar" | Loss & Avoidance wearing a helpful face. |
| any reward visible on the practice screen | The screen is one equation and one input. The moment money or a badge appears there, the screen is about money or badges. |

Everything in §3 lives in the child's own space or the parent view. **Nothing in
this document changes the practice screen except §3.1 and §3.5.**

---

## 3. What to build

Self-determination theory names three needs: competence, autonomy, relatedness.
The system already serves the first and serves neither of the others. That is
the whole opportunity here.

### 3.1 Session is an entity, counted in items

```sql
CREATE TABLE session_run (            -- LEDGER. Append-only.
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   TEXT NOT NULL REFERENCES player(id),
  target      INTEGER NOT NULL DEFAULT 20,   -- items
  completed   INTEGER NOT NULL DEFAULT 0,
  ended_at    INTEGER,                        -- NULL while open
  ended_early INTEGER NOT NULL DEFAULT 0,
  started_at  INTEGER NOT NULL
);
```

**Twenty items. Not ten minutes.**

Cepeda's meta-analysis of distributed practice finds retention is governed by
the *gap between* sessions, not their length — ten minutes daily beats seventy
on Sunday, and the mechanism is the forgetting in between, not willpower. The
inter-session gap is already in the system as `decay(s)`. Session length is not
a pedagogical quantity, so do not make it one.

Minutes are also fakeable by sitting still. Items are not.

**Rushing is self-defeating, by construction.** A child who guesses to finish
faster gets the retry, then the worked example, then a `Nästa` button. The
reveal path is *slower* than solving. No rule enforces this; the pedagogy does.

**`vet inte` counts toward the twenty.** Honesty must cost nothing.

**The counter is the only number on the practice screen.** Four small dots
remaining, or `16/20` in the same grey as the level ticks. A child who can see
that four problems remain is in a completely different psychological situation
from one facing an infinite stream. This is not a reward. It is a promise, and
it is the one counter permitted.

**Ending early is a button, not a failure.** Record `ended_early`. Never
mention it again — not to the child, not in the parent view, not in a query.

### 3.2 Autonomy: choose the skill, never the difficulty

At the start of a session — and only there — offer **three eligible skills**,
labelled by *content*:

```
   ×7        minus över tiotalet        x + a = b
```

All three are drawn from the selector's top candidates, so all three sit near
p ≈ 0.80. Choice among them is real autonomy at zero pedagogical cost.

**Never label a skill lätt/svår.** Learners systematically mis-choose when
difficulty is the axis: they prefer massed over spaced, blocked over
interleaved, easy over productive, because those *feel* like learning. Do not
offer them the choice they will get wrong.

Order the three randomly. Never mark one as recommended.

One honest lever: a **"svårare"** toggle in the child's own settings that shifts
the selector's target from p = 0.80 to p = 0.65. Reversible, unannounced,
unrewarded. **No badge for using it**, ever — the instant stretching yourself
earns a token, it stops being autonomy.

### 3.3 Peak-end: the last item is one they will get right

The selector already knows predicted p for every eligible skill. For item 20 of
20, ignore the interleaving penalty and serve the skill with the **highest** p.

Kahneman's peak-end rule: an episode is remembered by its peak and its ending.
A session ending in failure is remembered as a failed session. One line of code.

Do not tell the child. Do not make the last item trivially easy — highest
eligible p, not a manufactured gimme.

### 3.4 The card shelf — evidence, not verdicts

This replaces badges entirely, and it is the good version of what badges are
reaching for.

**When a skill unlocks for the first time, the child receives a card.**

The card contains:
- the actual first problem of that type the child ever solved,
- their own answer, as they typed it,
- the date.

Nothing else. No title. No rating. No "Mästare i sjuans tabell."

```sql
CREATE TABLE card (                   -- LEDGER. Append-only.
  player_id   TEXT NOT NULL REFERENCES player(id),
  skill_code  TEXT NOT NULL,
  attempt_id  INTEGER NOT NULL REFERENCES attempt(id),
  earned_at   INTEGER NOT NULL,
  PRIMARY KEY (player_id, skill_code)
);
```

Properties that matter:

- **Ungameable.** A card cannot be manufactured without genuinely unlocking the
  skill, which requires the prerequisites to be accurate *and* fluent. There is
  no strategy that produces cards faster than learning does.
- **Cumulative and never lost.** A bad day removes nothing from the shelf.
- **No hierarchy.** The `mult_table_2` card and the `lin_paren_both_sides` card
  are visually identical. No rarity, no tier, no gold. This is the icon-set rule
  again: the moment one card is better, someone got the good one.
- **It is a record, not a judgement.** The card says *this happened*, not *you
  are clever*.

Why the distinction is load-bearing: Mueller & Dweck found that person-directed
praise ("you're a maths person") produces contingent self-worth. The child who
has been told they *are* a maths person now has something to lose, and the first
genuinely hard problem threatens it; they quit rather than risk the identity.
Process-directed evidence does not do this. A badge is a verdict. A card is a
receipt.

The shelf lives behind the child's icon. Browsable, silent, no notification.
It is theirs, like the celeration chart.

### 3.5 The unlock moment

When a new kind of problem first appears, say so. Once, quietly, in one line
above the equation: `Något nytt.`

Then the problem. No fanfare, no animation beyond the existing 200ms opacity
transition, no sound. Novelty is a white-hat drive, it is free, and it cannot be
farmed.

### 3.6 Relatedness: the parent at the table

Not a feature. Write it in the README.

Beilock found that math-anxious parents who *helped* with homework made their
children worse at maths across a year; parents who did not help had no such
effect. The fix is not distance — it is the parent doing their own work at the
same table. Your own untimed session in the next tab is worth more than any
encouragement you could offer.

The system should make this easy: a parent is a player. Give yourself an icon.

---

## 4. If money must be involved

It need not be. Read §1 again first. If it is:

- **Pay per completed session, never per correct answer.** A flat rate on
  `session_run.ended_at IS NOT NULL AND completed >= target`. Nothing the child
  does *inside* the session changes the payout, so no in-session strategy can
  corrupt θ. Deci's meta-analysis finds task-non-contingent rewards do the least
  damage; this is the closest available approximation.
- **Cap it at two paid sessions per day.** Otherwise you have built a grinder,
  and these children already know how to grind — Pokémon GO taught them.
- **The payout is a query against the ledger, computed in the parent view.**
  No balance, no coin counter, no progress bar anywhere the child practises.
  Settle it in cash, at the table, weekly.
- **Ending early still counts as a session, unpaid.** Never punish stopping.

### 4.1 The family goal

Build this one. It is the best mechanic in the document.

```sql
CREATE TABLE family_goal (
  family_id   TEXT PRIMARY KEY REFERENCES family(id),
  label       TEXT NOT NULL,          -- "simhallen"
  target      INTEGER NOT NULL,       -- sessions, family-wide
  created_at  INTEGER NOT NULL,
  reached_at  INTEGER
);
```

- Denominated in **sessions**, family-wide. Never in correct answers.
- **Individual contributions are never shown.** Not to the parent, not to the
  child, not in a query you write "just for yourself." One number, one family.
- Cooperative and non-rival: everyone goes to the pool, or nobody does.
- No sibling can be the one who fell short, because there is no way to see who
  contributed what.

This is the only mechanic here that is simultaneously ungameable, uncorrupting,
and genuinely motivating. It works because the thing it rewards — showing up —
is the thing you actually want, and because the child cannot lose standing
within the family by being slow.

---

## 5. Acceptance

- The practice screen shows exactly one number: items remaining in this session.
- No route, view, or query returns per-child contribution to a family goal.
- No table stores points, XP, coins, or a streak length. Grep for them.
- The `vet inte` button counts toward session completion; assert it in a test.
- Removing every row from `card`, `session_run`, and `family_goal` changes no
  θ, no rate, no unlock. The motivational layer is strictly downstream of the
  model. Assert this by replaying with the tables dropped.
- Item 20 of 20 is the highest-p eligible skill. Assert over 1000 simulated
  sessions.
- Introduce any incentive → watch the `vet inte` rate for two weeks. If it
  falls toward zero, the change was wrong. Void, replay, revert.

---

## 6. What none of this is

The system cannot make a child want to do mathematics. It can avoid three
things: boring them (p ≈ 0.80), humiliating them (`vet inte`, worked examples,
no clock), and buying them (§1).

That is the whole offer. The rest is a parent at the table saying *you worked
that out* — and never *you're clever*.
