# English sentence-mode interference slice — build spec

Status: **COMPLETE — increments 1–2 built and deployed (2026-08-13); the tile production increment
is DROPPED, not deferred (Erik's call as spec author; see the bottom).** All eight seams ship as
recognition rungs, and the slice is recognition-only by decision, not by omission.
Original status: design proposed, self-contained for a fresh agent. This is the top of the English
ramp: L1-Swedish → L2-English **sentence-level grammatical interference** — the "Swenglish" errors
(V2 word order, do-support, continuous aspect, prepositions, is/get/become, make/do, false friends).
It is **production/discrimination at the sentence level**, reading-and-writing gated, and it is the
one genuinely separate project above the receptive on-ramp. It reuses the existing engine almost
entirely; the only new surface AS BUILT is a **sentence prompt** (the word-tile input discussed in
§2.4 was dropped — see the bottom).

Read this top-to-bottom before touching code. Part 1 is the context you need; Part 2 is the design;
Part 3 is the build.

---

# PART 1 — CONTEXT (the engine, the ramp, the conventions)

## 1.1 What celerant is
A Swedish maths/spelling/English fluency web app for one family. **Next.js 15 App Router,
better-sqlite3 (WAL) on Fly.io, TypeScript, vitest.** CI auto-deploys on push to `main` (build +
test must pass first — see `.github/workflows/ci.yml`). The dev loop for every change:
```
npm test            # vitest, all of test/*.test.ts
npx tsc --noEmit    # typecheck (CI runs it as part of build)
npm run build       # production build (the other CI gate)
# then: git add -A && commit && push  → CI deploys to celerant-obitz.fly.dev
```
Prod DB is at `/data/celerant.db` on the Fly machine (query live via `fly ssh console -C "node -e …"`;
the machine auto-suspends — `curl https://celerant-obitz.fly.dev/` to wake it first).

## 1.2 The difficulty model (READ THIS — it governs everything)
`src/skills.ts` opening comment: **difficulty is not a number on a problem; it is the shape of the
graph.** Each `Skill` is ONE seam (one cognitive operation that is absent or present). Where a seam
exists, there is a separate skill `code`. **Generators are ability-blind** — `generate(r: Rng)` only
gets a seeded RNG; it never sees θ. So a rung is never "scaled by ability"; you add a new rung for a
new seam. This is why the sentence slice is ~8+ rungs, each isolating one interference point.

`Skill` type (`src/skills.ts`):
```ts
type Skill = {
  code: string; family: string; subject: 'maths'|'spelling'|'english';
  year: number;                 // for ENGLISH: a difficulty rung, NOT a Swedish grade
  mode: 'component'|'compound'; sprintable: boolean;  // derived; choice rungs are never sprintable
  format: 'numpad'|'choice';    // 'choice' → ChoiceStage (tap one); 'numpad' → InputStage (type)
  kind?: 'rule'|'lexical';      // RULE = disjoint holdout (generalization); LEXICAL = closed set
  requires: string[];           // same-subject prerequisites (unlock gate)
  crossRequires?: string[];     // CROSS-SUBJECT prerequisites (e.g. reading, earned in Swedish)
  generate(r: Rng): Item;       // Rng = { int(a,b): number; pick<T>(xs): T }
};
```
Add a skill with the `S({...})` wrapper (defaults `family` from the code prefix, `subject` to
`'maths'`, `format` to `'numpad'`, derives `sprintable`). English rungs live in `tierEnglish` at the
bottom of `src/skills.ts`; `SKILLS` concatenates all tiers. **Every skill needs a Swedish label in
`src/lib/labels.ts`** or `test/labels-coverage.test.ts` fails.

## 1.3 The two answer surfaces you'll reuse
**ChoiceStage** (`src/app/_components/ChoiceStage.tsx`) renders a recognition item from an
`Item.choice: ChoiceSpec` (`src/lib/choice.ts`):
```ts
type ChoiceSpec = { prompt: ChoicePromptData; question: string; options: ChoiceOption[] };
// prompt kinds today: {show:'group'|'sum'|'structure'…} | {show:'listen', code, word} (plays audio)
//                   | {show:'word', word}   ← PRINTED word prompt (Phase D print bridge)
// option renders today: 'numeral' | 'group' | 'more'/'fewer' | 'picture'(kind=emoji) | 'letter'
//                     | 'swatch'(color) | 'picto'(kind=/pictos/<kind>.svg) | 'sizednoun' | 'nounverb'
//                     | 'word'  ← tap a PRINTED WORD, value graded as the word
```
Choice rungs are graded by the same `grade()` against `Item.answer` (a `{kind:'word', text}` for
words). They **cross on ACCURACY** (the recog_shadow crossing — 12 first-try attempts at ≥90%, see
§1.5), so they need no fluency system. This is the surface most sentence items should use.

**InputStage** (`src/app/_components/InputStage.tsx`) is the typed surface. `mode:'session'|'sprint'`,
a client clock (`performance.now()`, render→capture interval), and a **constrained pad** via the
`letters` prop (an array of glyph strings — the child taps to append to `value`; used by the Swedish
letter pad and the t15 tile pad). It auto-submits when `value` reaches `item.answerLength`, else the
child taps ✓. Capture contract: `onCapture({idemKey, code, seed, given, intervalMs, idk})`. **You
will add a `tiles` variant here** (word tiles instead of letter glyphs) for the ordering rungs (§2.4). **[DROPPED — see the bottom; the slice is recognition-only.]**

**The format dispatch** is in `src/app/practice/page.tsx` (~line 350): `const choiceItem =
buildItem(item.code, item.seed).choice;` then `choiceItem ? <ChoiceStage…/> : <InputStage…/>`. A
small **language flag** (`.lang-flag`, `/flags/{gb,se}.svg`) already renders above every `en_`/
`spelling_` item — English shows the Union Jack, so the child knows the tongue.

## 1.4 Item build & grading
`buildItem(code, seed)` (`src/lib/item.ts`) → `makeRng(seed)` → `generate(r)` → a `CanonItem`
`{ prompt, answer (a canonical STRING), steps, choice? }`. **`item.answer` is the canonical answer
string** (e.g. a `{kind:'word', text:'cat'}` answer surfaces as `"cat"`). `grade(given, answer)`
(`src/lib/grade.ts`) is **case-insensitive** for word answers. So a sentence answer is just a
`{kind:'word', text:'today i eat an apple'}` — lowercase, no punctuation — and the child's response
(tiles joined, or a picked option) is graded exactly, case-insensitively. **This is the whole reason
the one-answer decision (§2.5) is clean: everything grades through the existing word path.**

## 1.5 English seeding, gating, crossing (the load-bearing bits)
- **`subjectSeedGrade(schoolYear, subject)`** (`src/lib/onboarding.ts`): `english → 0` for EVERY
  child (a Swedish åkN kid is an English beginner). So NO child seed-skips English; everyone climbs
  from the floor. (maths/spelling use `seedGradeFor(schoolYear)`.)
- **Recognition (`format:'choice'`) rungs** cross via `recordRecogShadow` (`src/db/repo.ts`) — the
  first time a child is ≥90% first-try accurate over 12 clean attempts, a `recog_shadow` row is
  written → `recogCrossedSkills` → `recogFluent` → the successor unlocks. **Accuracy only, no
  fluency, no sprint.** The youngest earns each in order; an åk≥1 child seed-passes recognition.
- **Production (`format:'numpad'`) rungs** become fluent via `componentFluent` (`selector.ts`):
  `seedFluent || earnedFluent || recogFluent || rate≥aim`. `earnedFluent` needs a sprint/BURST
  crossing (the burst system is live — a mastered skill gets a silent timed run that awards a
  diploma; see `docs/burst-spec.md`). So a production rung crosses on SPEED, a recognition rung on
  ACCURACY. **Design implication (§2.4): prefer `format:'choice'` for sentence rungs so they cross
  on accuracy; use the tile production surface only where active assembly is the point.**
- **Cross-subject gate** (the "a graph stays closed until you catch up in another subject" mechanism,
  built 2026-08-12): `Skill.crossRequires: string[]` names codes in OTHER subjects that must be
  PASSED (`crossPassedPredicate` in `src/lib/practice.ts` = seed/earned/recog grant, global). Checked
  in `computeUnlocked`. The constant **`READING_READY = 'spelling_t1c'`** (top of the Swedish
  recognition ladder = "can read simple words", earned on accuracy) is the reading anchor. English
  spelling (`en_ed_regular`) and the print bridge already gate on it; **the sentence slice gates on
  it too** (it reads sentences).
- **Selector/θ stay subject-blind (the A11 boundary).** Only the pool source, the seed grade, and the
  item format are subject-aware. **Do NOT make the selector or θ reason about English or interference
  — that is a hard stop.** You only add content (skills, pools, generators), one small input surface,
  and one prompt kind.

## 1.6 The English on-ramp that already exists (this slice sits ON TOP)
`src/lib/english-content.ts` holds the pools + generators; `tierEnglish` in `src/skills.ts` the
rungs. Current ramp (all `subject:'english'`, `family:'en_hear'|'en_read'|'en_verb'|'en_irreg'`):
```
en_noun_cognate → en_noun_core → en_noun_category → en_noun_minpair   (hear → tap picture)
  → en_color (swatch)                                                  (hear colour → tap swatch)
  → { en_attribute → en_two_word ,  en_verb_action → en_verb_ing → en_frame_svo }
                                                                       (attributes / verbs / -ing / SVO frames)
  → [READING gate] en_word_recognise → en_word_picture                (print bridge)
  → en_ed_regular → en_past_irregular                                 (spelling: -ed, irregular past)
```
Everything up to the frames is **pre-literate recognition** (the 5yo climbs it). `en_ed_regular`
(RULE, disjoint holdout) and `en_past_irregular` (LEXICAL, closed set) are word DICTATION on the
letter pad. **The sentence slice attaches ABOVE `en_past_irregular`.**

**Audio pipeline**: `englishAudio(word)` (`english-content.ts`) → `/audio/english/<word>.mp3`
(`encodeURIComponent`'d — so spaces are fine: "the dog is running.mp3"). Clips are generated with
`edge-tts` (`en-GB-SoniaNeural`), see `scripts/spelling-audio/generate-english-phrases.mjs` (whole
phrases). Requires `python -m edge_tts` on PATH; paced ~1.8s + backoff.

**Seeding existing players**: a new skill is absent from a player's ability cache until they next
answer (replay seeds all `SKILLS`). To seed proactively, add a one-off `bridge_english_*_v1` in
`runOneOffPlacements` (`src/db/replay.ts`) — replay-all, guarded, runs once.

**Vetting tools** (test family fox+hotdog only): `/stava/granska` (audio ear-vet) and
`/stava/granska-bilder` (picture eye-vet, `image_review` table). If the slice adds visuals worth
checking, extend granska-bilder; audio (sentences) can be spot-checked in granska.

## 1.7 Motivation guardrails (apply to any child-facing feedback)
See `docs/motivation.md`: **witness, don't reward**; never a number a child can optimise; no pass/
fail verdict on a run; completion is a moment, not a standing; private, not comparative. The sentence
slice is content — it inherits the existing witness-only feedback (a quiet "done", the card shelf,
the diploma). **Do not add a score, a streak, or a "you sound native!" gamification.**

---

# PART 2 — THE DESIGN

## 2.1 What this slice teaches, and why it's separate
The receptive ramp teaches vocabulary and comprehension — the *easy* part for a Swedish speaker
(massive cognate overlap). The hard part is **sentence grammar where Swedish actively misleads.**
These errors persist for years because the Swedish rule is automatic. This slice drills exactly those
interference points, each isolated as one seam, with the Swedish pull explicitly contrasted against
the English form (Direct Instruction discrimination). It is separate because it is (a) production/
discrimination at the SENTENCE level, (b) reading+writing gated (top of the ramp), and (c) needs a
tiny new input surface. It is **content + two small UI additions**, NOT an engine change.

## 2.2 The interference seams (the content spine) — Swedish rule → English fix
Ordered by interference severity (interference-over-frequency: drill what misleads most, not what's
most common). Each is one seam = one or two rungs.

| # | Seam | Swedish pull → English | Example error → fix |
|---|---|---|---|
| S1 | **V2 / no inversion** | Swedish is verb-second; inverts after a fronted adverbial | *"Today eat I an apple"* → "Today **I eat** an apple" |
| S2 | **Do-support (questions)** | Swedish inverts, no "do" | *"Speak you English?"* → "**Do** you speak English?" |
| S3 | **Do-support (negation)** | *inte* after the verb, no "do" | *"I like not it"* → "I **do**n't like it" |
| S4 | **Continuous aspect** | Swedish has no -ing continuous | *"Look, it rains!"* → "Look, it**'s raining**!" |
| S5 | **Prepositions** | L1 default (*på*→"on") mis-transfers | *"good **on** football"* → "good **at**"; *"listen **on**"* → "listen **to**"; *"think **on**"* → "think **about**"; *"**on** the picture"* → "**in**"; *"wait **on**"* → "wait **for**" |
| S6 | **is / get / become** | *bli* = become; overused | *"I **become** happy"* → "I **get** happy"; *"**become** six"* → "**turn** six" |
| S7 | **make / do** | *göra* = both | *"**make** your homework"* → "**do** your homework" |
| S8 | **False friends** | *rolig*=funny, *eventuellt*=possibly, *lära*=learn/teach, *låna*=borrow/lend | *"the clown is **fun**"* → "**funny**" |

S1–S4 are **syntactic** (RULE nodes: disjoint holdout ⇒ generalization). S5 is **collocational**
(a closed-ish set per collocation; holdout = unseen collocations of the same interference class =
generalization of the discrimination). S6–S8 are **lexical** (small closed contrasts).

## 2.3 The prompt→response model (how the interference is actually ELICITED)
The interference only shows if the child must *produce/choose the English form against the Swedish
pull* — not transcribe. So:
- **Meaning comes from context the child can read** — the English sentence carries a blank/choice, OR
  (for word order) a Swedish sentence gives the meaning and the child must render it in English order.
- Audio is **secondary** here (these are reading-gated, text-first items). Optionally play the correct
  English sentence AFTER a correct answer as reinforcement; do not play it as the prompt for an
  ordering item (that would make it transcription).

## 2.4 The two response surfaces (reuse-heavy — this is the key build insight)
**Recognition-first, then production**, mirroring the whole ramp. For EACH seam, build a recognition
rung (cheap, crosses on accuracy) first; add a production rung only where active assembly matters
(chiefly S1 word order).

1. **Choice (cloze / form-choice / pick-the-correct-sentence)** — REUSE `ChoiceStage`, `format:'choice'`.
   - New **prompt kind `{show:'sentence', text, blank?}`**: render a sentence, with a marked blank
     (`___`) for cloze, or plain for pick-the-sentence. (One small addition to `ChoicePromptData` +
     one branch in `ChoiceStage`.)
   - Options use the **existing `render:'word'`** (tap a word/phrase). Value = the word/form/whole
     sentence; graded case-insensitively. Covers S2–S8 and the *recognition* of S1 ("pick the correct
     order": options are two whole candidate sentences as `render:'word'`).
   - Crosses on ACCURACY (recog_shadow). Zero fluency coupling. **Build these first.**
2. **Tiles (order the words)** — REUSE `InputStage` with a new **`tiles` prop** (array of word
   strings) instead of `letters`: the child taps word-tiles in order; `value` builds as
   `"Today I eat an apple"`; graded as a word answer against the canonical sentence. Tiles are
   seed-shuffled and may include 1–2 distractors (e.g. a Swedish-order lure). Manual ✓ submit (a
   sentence has no fixed `answerLength` boundary — or submit when tile count is reached). This is the
   *production* surface for S1 (and optionally S2/S3). It's a `format:'numpad'`, NON_SPRINTABLE
   production rung → crosses via the burst/fluency path like `en_ed_regular`, OR keep S1 as
   recognition-only (choice) for v1 and add tiles in a later increment. **Recommended v1: choice
   only; add tiles as increment 2.** **[DROPPED — see the bottom; the slice is recognition-only.]**

## 2.5 The grader decision — LOCKED: ONE ANSWER, by construction
The parked open question was "one-answer vs answer-set per item type." **Decision: every item in this
slice is ONE answer**, achieved by construction:
- Cloze/form/pick items give options such that exactly one is correct (the fixed collocation "good
  **at**", the correct form "is raining", the correct order).
- Tile items constrain the tiles so only one ordering is the target sentence.
- Grading is the existing case-insensitive `grade()` on a `{kind:'word', text}` answer.
**Do NOT author open cloze that admits multiple fills** (no "I ___ to school" = go/walk/run). If a
sentence genuinely has several right answers, constrain it (fewer tiles / fixed options) so it
doesn't. This keeps the grader untouched and authoring unambiguous. (Answer-set grading is a possible
future generalization; it is explicitly OUT of scope here.)

## 2.6 Skill-graph placement, sequence, kinds, gating
All `subject:'english'`, `family:'en_sentence'`, reading-gated. Suggested rungs (recognition v1):
```
en_sv_order      (S1 recognition: pick correct SVO order)   RULE   requires en_past_irregular
en_do_question   (S2: do-support in questions)              RULE   requires en_sv_order
en_do_negation   (S3: do-support in negation)               RULE   requires en_do_question
en_continuous    (S4: simple vs continuous)                 RULE   requires en_do_negation
en_preposition   (S5: the collocation set)                  RULE   requires en_continuous
en_is_get        (S6: is/get/become)                        LEXICAL requires en_preposition
en_make_do       (S7: make vs do)                           LEXICAL requires en_is_get
en_false_friend  (S8: false friends)                        LEXICAL requires en_make_do
```
- **`crossRequires: [READING_READY]`** on every rung (they read sentences). Consider a STRONGER
  reading anchor than `spelling_t1c` if you judge full-sentence reading needs more than decoding —
  e.g. a Swedish word-production rung. If so, add a named constant next to `READING_READY` and note
  the choice; default to `READING_READY` to start.
- `year: 2` (an English difficulty rung above `-ed`; keep it ≥ the `-ed` year so seeding places it
  above). `mode:'component'`, `format:'choice'` (v1), `kind` as tabled.
- `en_sv_order` `requires: ['en_past_irregular']` anchors the slice above the word-production tier.
- RULE nodes need a **disjoint holdout** in their pool (practice sentences vs unseen holdout sentences
  of the same structure) so a crossing = generalization — mirror `EN_ED_REGULAR`'s shape.

## 2.7 The Morningside framing (so the content is authored right)
- **One seam per rung**, **minimal pairs**, the Swedish pull shown against the English fix
  (discrimination). E.g. an S1 item shows the meaning and two orderings — the L1-order lure and the
  correct one; the child learns to reject the lure.
- **RULE + disjoint holdout ⇒ generalization** (S1–S5). **Closed contrast** for lexical seams (S6–S8);
  holdout = unseen items of the same class.
- **Interference-over-frequency** sequencing (already reflected in the table order).
- **Own authoring** from contrastive analysis (these interference points are well-documented in
  SLA/Swedish-English contrastive linguistics). Do **not** copy any published course. Keep sentences
  short, concrete, child-appropriate, using vocabulary the child already met in the receptive ramp
  (cat/dog/apple/run/…) so the ONLY new thing is the grammatical seam.

---

# PART 3 — THE BUILD

## 3.1 New surfaces (small)
1. **`ChoicePromptData` += `{ show:'sentence'; text: string }`** in `src/lib/choice.ts`; render branch
   in `ChoiceStage.tsx` (show the sentence; a `___` in `text` marks the blank). CSS: a `.sentence-prompt`
   rule (large readable text, the blank visually distinct).
2. **(increment 2) InputStage `tiles?: string[]` prop** **[DROPPED — see the bottom; the slice is recognition-only.]**
   — render word-tile buttons (seed-shuffled by
   the generator; the generator provides them), tapping appends `tile + ' '` to `value`; ✓ submits;
   backspace removes the last tile/word. Grade the trimmed joined string. Wire in `practice/page.tsx`
   analogous to the `letters` spread. The `render:'word'` option already exists for choice items.

## 3.2 Content (`src/lib/english-content.ts`)
- One pool per seam, each `{ practice: SentenceItem[], holdout: SentenceItem[] }` where a
  `SentenceItem` carries what the generator needs: for a cloze/form rung `{ prompt (sentence with
  ___ or context), answer (the correct word/form), distractors (wrong forms, incl. the L1 lure) }`;
  for a pick-order rung `{ prompt (meaning), answer (correct sentence), lure (L1-order sentence) }`;
  for a tile rung `{ prompt (meaning), answer (sentence), tiles (words + distractors) }`.
- A generator per rung (`enSvOrderItem`, `enPrepositionItem`, …) that `r.pick`s a practice item and
  emits the `Item` (`prompt:""`, `answer:{kind:'word',text: canonical-lowercase}`, `choice:{…}`).
  RNG-seeded, like the existing `en*Item` helpers — NOT the unseen-word provider.
- Export any word lists needed for audio + tests.

## 3.3 Skills, labels, bridge
- Add the rungs to `tierEnglish` (`src/skills.ts`) per §2.6 (with `crossRequires`).
- Add a Swedish label for each in `src/lib/labels.ts` (e.g. `en_sv_order: 'engelska: ordföljd'`).
- Add `bridge_english_sentence_v1` (replay-all) in `runOneOffPlacements` (`src/db/replay.ts`).

## 3.4 Audio (optional/secondary)
Generate the reinforcement clips (correct English sentences) with a new
`scripts/spelling-audio/generate-english-sentences.mjs` (copy `generate-english-phrases.mjs`,
`en-GB-SoniaNeural`, whole sentences). Only if you use audio reinforcement; the items are text-first,
so audio is not required for v1.

## 3.5 Tests (`test/english-onramp.test.ts` or a new `test/english-sentence.test.ts`)
- Each rung `buildItem` yields the right `choice.prompt.show` and options; the answer is one of the
  options; exactly one option is correct (one-answer invariant).
- RULE rungs: practice ∩ holdout = ∅ (disjoint, like the `en_ed_regular` test).
- Cross-gate: each rung `crossRequires` contains `READING_READY`; `en_sv_order.requires` contains
  `en_past_irregular`.
- The interference is present: for S1, the L1-order lure is among the options and is NOT the answer.
- (increment 2) tile rung: the tiles contain exactly the answer's words (+ any declared distractors). **[DROPPED — see the bottom; the slice is recognition-only.]**

## 3.6 Deploy loop
`npm test` → `npx tsc --noEmit` → `npm run build`, all green, then commit + push (CI deploys). Keep
each seam/increment a separate commit. After deploy, spot-check on the test family; a real tablet
pass with a literate kid (sushi, åk4) is the acceptance test — she is the one who'll hit this tier.

## 3.7 Staging (each independently shippable)
1. **The `sentence` prompt kind + S1–S4 recognition rungs** (V2 order, do-support ×2, continuous) —
   the syntactic core, all `format:'choice'`, accuracy-crossed. Smallest, highest value.
2. **S5 prepositions** (the collocation set) + **S6–S8 lexical contrasts**.
3. ~~**(increment) tile production surface** + production rungs for S1 (and optionally S2/S3).~~ **[DROPPED — see the bottom; the slice is recognition-only.]**
4. **(later) audio reinforcement**, and any answer-set generalization IF a future item type needs it
   (out of scope for now).

## Decisions LOCKED
- One answer per item, by construction (§2.5). No answer-set grader.
- Recognition-first (`format:'choice'`, accuracy-crossed); tiles are a later production increment.
- Reading-gated via `crossRequires` (default `READING_READY = spelling_t1c`).
- Interference-over-frequency sequence; RULE+disjoint-holdout for syntactic seams; own authoring.

## Decisions RESOLVED (as built, 2026-08-13)
- **Reading anchor: `READING_READY` (`spelling_t1c`) kept.** The real gate is the `requires` chain,
  not the `crossRequires`: the slice sits above `en_ed_regular` and `en_past_irregular`, which are
  English word DICTATION rungs. A child who can spell English words can read these sentences, so a
  second anchor would be redundant.
- **S5 preposition set (8):** good AT, listen TO, look AT, wait FOR, think ABOUT, IN the picture,
  interested IN, afraid OF — the *på*-cluster first, since one Swedish preposition mis-transfers into
  five English ones. Holdout (unseen collocations, same interference classes): angry WITH (arg på),
  proud OF (stolt över), tired OF (trött på), married TO (gift med), ask FOR (be om). Three carrier
  sentences per collocation so the answer can't be keyed to a remembered sentence.
- **S8 false-friend set (6):** lära/teach-learn, låna/borrow-lend, chef/boss, fabrik/factory,
  recept/recipe, semester/holiday. Airtight pairs ONLY — every lure is unambiguously wrong English,
  so the one-answer-by-construction rule (§2.5) holds. **rolig→funny is deliberately excluded**:
  "a fun joke" is arguable, so it would be the one item with two defensible answers.
- **Generalization for a recognition rung.** A choice rung has no practice→holdout phase mechanism
  (the generator is ability-blind and there is no sprint), so a disjoint holdout alone cannot make a
  crossing mean generalization. Solved by COMPOSING sentences combinatorially — adverbial × clause,
  subject × predicate, subject × verb × cue — giving 18–100 practice items per RULE seam, far wider
  than the 12-attempt accuracy window. The disjoint holdout is authored alongside (its constituents
  are disjoint sets, so no sentence can coincide) and is what a production rung would draw from.
  LEXICAL rungs carry a holdout but NO width floor: a closed contrast is meant to repeat.
- **Options are TWO, always** — the minimal pair. A wrong tap is then the interference error itself,
  so the question log reads as a diagnosis rather than a miss.
- **Pools are NOT registered in `EN_POOLS`.** A code in `SPELLING_POOLS` is routed by `buildItem` to
  the word-dictation branch (seed → word, letter pad) and would never build its `choice` spec.

## Decision DROPPED — the tile production rungs (increment 3)
**The slice is recognition-only, and complete.** Not deferred, not a TODO: this is the shipped shape.
Erik's call as spec author, on three grounds:
1. **The recognition rungs already achieve the goal.** They cross on ACCURACY (no aim needed), and
   discriminating the correct English form against the Swedish pull IS the interference drill.
   Recognition-at-fluency is a legitimate endpoint, not a waypoint to production.
2. **Tiles would cost an aim-model change for marginal gain** (see below). A tiles/min aim is a
   deliberate, A11-sensitive change to `aimForSkill` — a separate, scoped project to be specced on
   purpose, never smuggled into a content increment.
3. **It sidesteps the pool trap entirely.** Recognition rungs never touch `SPELLING_POOLS`, so the
   `sprintBatch`/word-dictation routing hazard never applies at all.

If genuine sentence PRODUCTION is ever wanted, it starts with a "tiles/min aim" design document, not
with an `InputStage` prop. The reason, recorded so the next reader doesn't rediscover it:

**A tile rung has no honest fluency aim.** A production
(`format:'numpad'`) rung crosses on SPEED against `letterAimFor`, which budgets motor time as
LETTERS typed. For "Today I eat an apple." at åk4 (`defaultLetterCeiling(4)` = 22 letters/min) that
is 60/(46.4 + 2) ≈ **1.2 items/min** — while tapping five word-tiles takes well under ten seconds,
i.e. ~6× the aim. The gate would be a rubber stamp on the first clean run. Two further snags:
`sprintBatch` draws non-maths sprint words from `SPELLING_POOLS[code]`, which these pools must stay
out of (above), so a tile rung would be flagged `sprintable` yet never actually sprint unless it is
added to `NON_SPRINTABLE` or given a new word-source branch.
Building it therefore means either mis-measuring it or touching the aim model — which is why it is a
separate project rather than the next increment of this one.

## Engine boundary / STOP-FLAG
Selector, θ, gate, ledger, reward stay untouched and subject-blind (A11). You add: content (skills/
pools/generators), one prompt kind, one input variant, labels, a bridge, tests. **If anything wants
the selector or θ to reason about English, interference, or "answer-set" — STOP and reassess.** This
slice is content on the existing rails, exactly like the rest of the on-ramp.
