# UI and lifecycle

Extends `agent-brief.md`, `fluency-addendum.md`, `feedback-placement.md`,
`handoff.md`. Where those disagree with this, **this wins**, and your first
task is to fix them in place rather than leave the contradiction in the repo.
Two corrections are load-bearing: §4.1 (a family is a *pair* of icons) and
§4.5 (placement is not a gate).

Ships with `icons.ts` and `icons.check.ts` alongside `skills.ts` and
`verify.ts`. All four are validated and currently green.

---

## 1. The one rule

> **`attempt`, `sprint`, and `tool_rate` are ledgers. `ability` is a cache.**

Ledgers are append-only. Nothing is updated or deleted in them, ever, with two
exceptions: a tombstone (`voided_at`) and a change of owner (§6.2). Caches are
derived, and any cache may be dropped and rebuilt by replaying the ledger in
`at` order.

This makes almost every hard problem below trivial. Wrong child solved forty
problems? Reassign the rows, drop the cache, replay. Årskurs was wrong?
Re-seed, replay. A generator bug shipped? Tombstone those rows, replay — and θ
correctly falls back to its seed, because you no longer hold valid evidence.

`replay(playerId)` is the most important function in the codebase. Write it in
phase 1. Test it in phase 1. Everything else leans on it.

---

## 2. Schema

```sql
CREATE TABLE family (
  id            TEXT PRIMARY KEY,
  icon_pair     TEXT NOT NULL UNIQUE,      -- "fox+hotdog": two keys, sorted, joined
  pin_hash      TEXT NOT NULL,             -- argon2id; entry PIN
  parent_hash   TEXT NOT NULL,             -- argon2id; parent-view PIN, must differ
  created_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);

CREATE TABLE player (
  id            TEXT PRIMARY KEY,
  family_id     TEXT NOT NULL REFERENCES family(id),
  icon          TEXT NOT NULL,             -- single key; unique within family only
  school_year   INTEGER NOT NULL CHECK (school_year BETWEEN 0 AND 9),  -- 0 = förskoleklass
  created_at    INTEGER NOT NULL,
  archived_at   INTEGER,
  UNIQUE (family_id, icon)
);

-- LEDGER
CREATE TABLE attempt (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     TEXT NOT NULL REFERENCES player(id),
  skill_code    TEXT NOT NULL,             -- NOT a foreign key. Skills live in code.
  item_json     TEXT NOT NULL,             -- prompt, answer, steps, selector score vector
  given         TEXT,                      -- what the child typed; NULL for "vet inte"
  correct       INTEGER NOT NULL,          -- 0 | 1, first try only
  tries         INTEGER NOT NULL,          -- 1 | 2 | 0 for "vet inte"
  dont_know     INTEGER NOT NULL DEFAULT 0,
  latency_ms    INTEGER NOT NULL,          -- recorded; NEVER displayed to a child
  at            INTEGER NOT NULL,
  voided_at     INTEGER,
  void_reason   TEXT
);

-- LEDGER
CREATE TABLE sprint (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL REFERENCES player(id),
  skill_code TEXT NOT NULL, duration_s INTEGER NOT NULL,
  correct INTEGER NOT NULL, errors INTEGER NOT NULL,
  at INTEGER NOT NULL, voided_at INTEGER, void_reason TEXT
);

-- LEDGER
CREATE TABLE tool_rate (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL REFERENCES player(id),
  digits_per_min REAL NOT NULL, at INTEGER NOT NULL, voided_at INTEGER
);

-- CACHE. Droppable. Rebuilt by replay().
CREATE TABLE ability (
  player_id     TEXT NOT NULL REFERENCES player(id),
  skill_code    TEXT NOT NULL,
  theta         REAL NOT NULL,
  n_obs         INTEGER NOT NULL,
  last_seen_at  INTEGER,
  rate          REAL,                      -- NULL iff rate_state = 'unknown'
  rate_state    TEXT NOT NULL CHECK (rate_state IN ('unknown','provisional','measured')),
  PRIMARY KEY (player_id, skill_code)
);

CREATE TABLE session (
  token_hash TEXT PRIMARY KEY,
  family_id  TEXT NOT NULL REFERENCES family(id),
  parent     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
```

There is **no `player_id` on `session`**. See §6.6 — it would be a data race
between siblings on two tablets.

`attempt.skill_code` is a string, not a foreign key. Skills live in code. A
skill deleted from `skills.ts` leaves its attempts behind, correctly, and
`replay()` skips codes it no longer knows.

---

## 3. Icons

### 3.1 The set

`icons.ts`. **186 icons**, nine categories: djur 42, mat 24, frukt 20,
fordon 20, verktyg 18, väder 18, växter 16, sport 16, instrument 12.

Curation rules live in the file header and are enforced by `icons.check.ts` in
CI. The one worth restating:

> **No rank ordering.** If 🐉 and 🐌 are both present, one child got the good
> one. There is no dragon, no lion, no unicorn, no shark. This system spends
> enormous effort having no status gradient in it. Do not introduce one at the
> login screen.

Also excluded, and asserted against by codepoint range: human faces and people,
skin-tone modifiers, flags, religious symbols. Nothing scatological — the
six-year-old will choose 💩 and the eight-year-old will care. No innuendo; 🍆
and 🍑 are absent and you know why.

### 3.2 Metadata

Each icon carries `{ key, glyph, name, category, keywords[] }` in Swedish. The
database stores **`key` only, never the glyph**: a curation change must never
orphan a family.

The names and keywords in `icons.ts` are hand-written placeholders. **Your first
task on this file** is to reconcile them against Unicode CLDR
(`common/annotations/sv.xml` and `annotationsDerived/sv.xml`), which publishes a
short name and keyword list per emoji, translated and maintained by someone
other than us. Preserve `key` and `category`; take `name` and merge `keywords`.

### 3.3 Search is for parents

`search()` is diacritic-folded, so `kott` finds `kött`. It belongs on
create-family and admin screens, where an adult is present.

**Never put a text field on the child's screen.** A child confronted with an
input will type in it, and the only other input in this application is the
answer to a maths problem. The child's interface is a grid, always.

---

## 4. Flows

### 4.1 A family is a *pair* of icons

Single-icon families cap the system at `families ≤ icons`, and a grid of
hundreds is not a grid — a five-year-old scrolls past their own fox.

So a family is an **unordered pair**: "räven och varmkorven." 186 icons give
**17,205 families**, and a pair is far more memorable to a child than the 187th
animal would be. Canonical storage is the two keys sorted and joined with `+`.
`familyKey()` enforces this; identical pairs throw.

Player icons remain single, unique **within a family only**. Two families may
both contain the fox.

### 4.2 Create family

1. Grid with category tabs and a parent-facing search box. Pick icon one.
2. Same grid. Pick icon two; it may not equal the first. Taken pairs are
   absent, not greyed — nothing that isn't there needs explaining.
3. **Entry PIN:** four digits, twice. Reject repeats (`1111`) and runs
   (`1234`, `4321`). One line saying why.
4. **Parent PIN:** four digits, twice, must differ from the entry PIN. One
   sentence: the children will know the first, and must not know the second.
5. Straight into create-player.

### 4.3 Create player

1. Grid, full set minus icons already used in this family. One icon.
2. **Årskurs, not age.** Buttons: `F 1 2 3 4 5 6 7 8 9`. `F` is förskoleklass
   → `school_year = 0`.
   Never ask for age. `skills.ts` consumes årskurs; age is a lossy proxy for
   it, and an August-born and a January-born seven-year-old are a full school
   year apart.
3. Seed `ability` for every skill:
   ```
   theta      = clamp(0.6 * (school_year - skill.year), -1.5, 1.0)
   n_obs      = 2                        // a rumour, not a measurement
   rate       = component ? aimFor(skill) * (school_year >= skill.year ? 1.0 : 0.6) : NULL
   rate_state = component ? 'provisional' : 'unknown'
   last_seen  = NULL
   ```
4. First problem. Immediately.

### 4.4 Returning, and the device cache

`localStorage` holds the last `family_id` used on this device. On load:

- **Cached** → that family's two icons, large, with the PIN pad beneath. A
  small "byt familj" link clears the cache and shows the grid.
- **No cache** → the family grid. Parents may search; children will not need to.

Then: PIN → player grid → problem. In steady state on a home tablet this is
**four digits and two taps.**

The device cache holds `family_id` and nothing else. Never the PIN. Never a
token outliving the session. **Never a `player_id`** — on a shared tablet that
is the wrong-child bug made permanent (§6.6).

The session cookie holds `family_id` for 30 days. The PIN is re-asked when it
expires, and always before the parent view.

No "welcome back." No streak. No "you were last here 3 days ago."

### 4.5 Placement is not a gate — correction to `feedback-placement.md`

That document put tool-skill measurement and a placement sprint on the path to
the first problem. **It was wrong. This flow is right.**

Provisional rates seeded from årskurs already satisfy the fluency gate; that was
the entire purpose of making `rate_state` three-valued. A child's first screen
must be a problem, not a timed writing test.

- **Tool-skill measurement** runs the first time the child opens sprint mode,
  which is opt-in and may never happen.
- **Placement by testing down** becomes a parent action — "mitt barn ligger
  fel" — never automatic, never on first login.
- If sprint mode is never opened, the child practises forever on provisional
  rates and the system works. Sprints refine; they do not authorise.

`aimFor(skill)` before any `tool_rate` exists uses a per-årskurs default table.
It is a guess, marked provisional, and one real measurement overwrites it
outright — never averaged against the seed.

### 4.6 Parent view

Separate PIN. Deliberately dull. Per `agent-brief.md` §8: θ per skill as a plain
table, 7-day attempt counts, no accuracy percentage, no chart, no sibling
comparison — do not build the query.

The celeration chart is **not** here. It is the child's, per
`fluency-addendum.md` §5.

---

## 5. CRUD

### 5.1 family

| op | route | notes |
|---|---|---|
| create | `POST /family` | pair + two PINs. §4.2 |
| read | `GET /families` | icon pairs only. No player counts. Rate-limit hard. |
| change pair | `PATCH /family/:id/icons` | parent PIN. Fails if pair taken. |
| change entry PIN | `PATCH /family/:id/pin` | requires the **parent** PIN, not the old entry PIN — a child who knows the entry PIN must not be able to change it. |
| change parent PIN | `PATCH /family/:id/parent-pin` | requires old parent PIN. |
| recover | — | **No recovery exists.** §8.1 |
| soft delete | `DELETE /family/:id` | parent PIN. Hidden, retained, restorable 30 days. |
| hard delete | `DELETE /family/:id?purge=1` | parent PIN, re-typed twice. Cascades to every ledger row. The only place a ledger row is truly deleted. |

### 5.2 player

| op | route | notes |
|---|---|---|
| create | `POST /player` | icon + årskurs. Seeds `ability`. §4.3 |
| read | `GET /family/:id/players` | after entry PIN. |
| change icon | `PATCH /player/:id/icon` | children may do this themselves. It's an icon. |
| change årskurs | `PATCH /player/:id/year` | parent PIN. **Not a re-seed.** §6.1 |
| archive | `POST /player/:id/archive` | parent PIN. Off the grid, ledger retained. |
| unarchive | `POST /player/:id/restore` | parent PIN. |
| delete | — | **Not offered.** Archive instead. Hard-deleting a player means hard-deleting a family. |
| reassign | `POST /player/:id/reassign` | §6.2 |

Årskurs also advances on prompt: at the first login after 15 August, offer once
— "Ny årskurs?" — with `+1` and "nej". **Never advance silently.**

### 5.3 attempt / sprint / tool_rate

Create and void. Never update. Never read by a child.

| op | route | notes |
|---|---|---|
| create | `POST /item/:id/answer` | server grades; the client never saw the answer. |
| void | `POST /attempt/:id/void` | parent PIN. Tombstone + reason. Triggers replay. |
| bulk void | `POST /player/:id/void-range` | `from`, `to`, reason. For "katten satt på tangentbordet". |

Voiding a `tool_rate` recomputes every aim and therefore every unlock. Expensive
and correct. Do it synchronously; it happens roughly never.

### 5.4 ability

**No public write route exists.** Not for the parent. Not for debugging.

| op | route | notes |
|---|---|---|
| read | `GET /player/:id/ability` | parent PIN. |
| rebuild | `POST /player/:id/replay` | parent PIN. Drops and replays. Idempotent. |

If you want to `UPDATE ability SET theta = ...`, you want a ledger row instead.
There are no exceptions, and an agent that adds one has broken the only real
guarantee this system has.

---

## 6. The hard cases

### 6.1 Årskurs changes

θ now holds real evidence and must not be overwritten.

```
replay(playerId, { schoolYear: newYear })
```

Re-seed from the new year, then replay the whole ledger over it. Well-practised
skills barely move; never-practised skills move fully. Correct behaviour, free.

### 6.2 The wrong child

A shared PIN and an icon grid is precisely the affordance for a six-year-old
tapping their sibling's fox. This will happen. **Do not try to prevent it.**

Parent view lists recent sessions: `🦊 · 14 svar · 19:40–19:52`. One button:
**"Det var fel barn."** Choose the correct player, then

```sql
UPDATE attempt SET player_id = :correct WHERE id BETWEEN :lo AND :hi;
```

This is the only `UPDATE` permitted on a ledger. It changes ownership, never
content, and is followed by `replay()` on both children.

### 6.3 A skill's `year` changes in `skills.ts`

Bump `SKILLS_VERSION`. On boot, if the stored version differs, replay every
player. A few thousand rows; milliseconds.

### 6.4 A skill is deleted from `skills.ts`

`replay()` skips unknown `skill_code`s. The `ability` row vanishes on rebuild.
The attempts remain in the ledger forever, which is correct: they happened.

### 6.5 A generator bug shipped

Bulk-void by `skill_code` and time range, reason `"generator bug: ..."`. Replay.
θ on that skill returns to its seed — the honest state, since you hold no valid
evidence about it.

This is why `verify.ts` runs in CI, and why `item_json` stores the whole item
rather than a reference to a generator.

### 6.6 Two children, two tablets, one family

One session cookie makes `session.player_id` a data race. So there isn't one.

**`player_id` is a parameter on every item and answer request**, not session
state. Assert on the server that the requested player belongs to the session's
family. That assertion is the entire authorisation model, and two children on
two devices under one family cookie is then simply fine.

The device cache (§4.4) holds `family_id` for the same reason.

### 6.7 The answer arrives after a reload

Item generation writes nothing. `POST /item` returns `{ itemId, prompt }` and
stashes the answer server-side behind a short-lived signed token. If no answer
arrives, no attempt is recorded and nothing is inferred.

**Never infer a wrong answer from silence.** A child who closes the laptop
mid-problem has not failed it. Abandonment is not evidence.

---

## 7. Invariants asserted at boot

- `verify.ts` passes. `icons.check.ts` passes.
- Every `ability.rate_state = 'unknown'` row belongs to a compound skill.
- No `ability` row references a `skill_code` absent from `skills.ts`.
- `family.pin_hash != family.parent_hash`.
- Every `family.icon_pair` is canonical: two distinct known keys, sorted.
- **Replaying every player reproduces `ability` exactly.** Run this in CI
  against a seeded fixture. It is the single test that protects the design.

---

## 8. Things there are deliberately no routes for

### 8.1 PIN recovery

There is no email address in this system and there will not be one. A forgotten
parent PIN means the parent view is gone; the children keep practising, the
ledger is intact, and a parent with shell access rewrites `parent_hash` directly.

Say this in one sentence on the create-family screen. Do not build a recovery
flow with a security question — a security question is a weaker PIN written in
prose.

### 8.2 Export

Do build `GET /family/:id/export` → the full ledger as JSON, parent PIN. Twenty
lines, and it is the difference between a home server and a hostage situation.
No import route: importing is `sqlite3 < dump.sql`.

### 8.3 Everything else

No accounts outside the house. No email. No display name. No profile. No friends.
No sharing. No notifications. No analytics. No avatar customisation beyond the
icon.

The strongest privacy property this system has is that **it never learns a
child's name.** Every feature above would take it away.
