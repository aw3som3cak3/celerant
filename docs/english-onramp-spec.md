# English on-ramp — implementation spec

Status: **design proposed.** A long, gentle ramp from *first contact* (hear an English word → tap the
picture) up to the existing morphographic `-ed` logic, every rung one small seam, all on the recognition/
production engine we already run. Reuses selector / θ / gate / ledger / the recognition-crossing and burst
fluency machinery **unchanged**. Continues [[english-subject]] and mirrors the Swedish `t0…t1c` ladder and
the maths GROUND ladder.

## Why (the case, briefly)
The first English slice shipped a *production* rung (`en_ed_regular`: spell the `-ed` past) with **no floor
under it**. Live proof it's mis-pitched: the only child who reached it (sushi, åk4) is **0/13**, writing
Swedish forms (`cooked`→"kokt", `looked`→"lukt") or IDK (8/13). First contact with a language is
**comprehension, not production** — receptive-before-productive is the one thing every tradition agrees on
(Krashen comprehensible input & the silent period; Asher TPR = *hear→point*; Nation: receptive vocabulary
precedes productive by thousands of words). The 5yo forces the issue: she can't spell in Swedish, so English
**cannot** start with letters. It starts with *meaning from sound*.

**Morningside mapping** (why this fits our engine): (a) *component→composite / generative instruction* —
teach a small set of fluent components (core vocabulary + a few frames) that **recombine** to comprehend
untaught sentences; our RULE/holdout = generalization is the same idea. (b) *Precision-Teaching fluency* —
build recognition to *fast & automatic*, which is our recognition-crossing (accuracy) + burst (speed). (c)
*Direct Instruction* — faultless example selection & **minimal-pair discrimination**, so errors are rare
(the opposite of sushi's cold `-ed`). (d) *Sidman stimulus equivalence* — teach spoken→picture and later
spoken→print; picture↔print then **emerges untaught** (fewer trials, more knowledge).

---

## The ramp (each rung is ONE seam)

Phases A–C are **pre-literate** (no letters) — the 5yo's whole world for a long time. Phases D–F need
reading/writing and are literacy-gated. `requires` chains them; difficulty is graph shape, not a knob.

### Phase A — Receptive nouns · audio → tap picture · reuses the `spelling_t0` pattern exactly
| rung | task | the new seam |
|---|---|---|
| `en_noun_cognate` (floor, requires []) | hear an English noun → tap its picture; **cognate nouns**, distractors = *unrelated* pictures | first contact; a near-guaranteed win (L1 cognate + easy discrimination) |
| `en_noun_core` | non-cognate high-frequency nouns | L1 crutch removed |
| `en_noun_category` | distractors from the **same category** (animal vs animal) | finer meaning discrimination |
| `en_noun_minpair` | distractors are **phonological minimal pairs** (cat/hat/cap, ship/sheep) | English *sound* discrimination (the DI move) |

### Phase B — Attributes & first recombination · audio → tap picture
| rung | task | seam |
|---|---|---|
| `en_color` | hear a colour → tap the colour | attribute vocabulary |
| `en_attribute` | big/small, hot/cold, happy/sad | contrastive attributes |
| `en_two_word` | hear "red ball" / "big dog" → tap picture | **generative**: recombine known noun+attribute (first composite) |

### Phase C — Actions & simple frames · audio → tap picture (TPR-style)
| rung | task | seam |
|---|---|---|
| `en_verb_action` | hear a base verb (run, jump, eat, sleep) → tap the action picture | verbs, receptively |
| `en_verb_ing` | hear "running", "eating" → tap picture | morphology **receptively** — meaning first, long before producing `-ed` |
| `en_frame_svo` | hear "the dog is running" → tap picture | generative comprehension of a whole simple clause |

### Phase D — Print bridge · needs reading (literacy-gated) · equivalence pays off
| rung | task | seam / engine note |
|---|---|---|
| `en_word_recognise` | hear a noun → tap the **printed English word** | NEW render kind: word-string options (see Gap 3) |
| `en_word_picture` | printed word → tap picture | reading comprehension; **partly emerges** from A+`en_word_recognise` via equivalence |

### Phase E — Early production · letter pad · bridges into the existing logic
| rung | task | seam / engine note |
|---|---|---|
| `en_copy` | the word is shown; **copy/trace** it on the letter pad | motor + orthography, not recall (reuses InputStage `promptOverride`, as the writing-speed probe does) |
| `en_spell_noun` | dictation of a **long-known** concrete noun (hear "cat" → spell) | first real production, on vocabulary owned since Phase A |
| `en_spell_verb` | dictation of base-form verbs | production of the verbs `-ed` will build on |

### Phase F — Morphology · the EXISTING slice, now reachable
| rung | task | change |
|---|---|---|
| `en_ed_regular` (exists) | produce the `-ed` past | **re-parent** `requires: []` → `requires: ['en_spell_verb']` (it now sits on a real floor) |
| `en_past_irregular` (exists) | `went`-type irregulars | unchanged (`requires: ['en_ed_regular']`) |
| *(deferred)* sentence-mode interference (är/bli, V2 word order, prepositions) | — | its own spec; only after this ramp works |

~17 rungs, first-contact → morphology. Phases A–C (10 rungs) are pre-literate; the 5yo climbs all of them.

---

## What's reused vs. what's new (grounded in the code)

**Reused unchanged** — the ramp mostly *is* the existing engine:
- Recognition rungs = `format: 'choice'`, rendered by `ChoiceStage`. Phases A–C author `{ show: 'listen', code: 'en_…', word }` prompts + `render: 'picture'` options → `<img src="/emoji/<kind>.png">`. **This is precisely `spelling_t0`** (`skills.ts:950-970`, `ChoiceStage.tsx:196-200`).
- Audio already routes: `spellingAudio` branches on the `en_` code prefix → `englishAudio` → `/audio/english/<word>.mp3` (`spelling-content.ts:191-192`).
- Crossing/ordering: any `format:'choice'` skill flows through `isRecog` (`practice.ts:56`), seeds at **grade 0 for every child** (`ENGLISH_SEED_GRADE`, `onboarding.ts:82`) so *nobody seed-skips English*, and crosses on the same **12-attempt / 90%** `recog_shadow` gate (`repo.recordRecogShadow`). Successors unlock via `requires`. **No new gating mechanism.**
- Production rungs (Phase E–F) = letter-pad dictation (existing `InputStage` letter mode + `ENGLISH_LETTERS`), and they can **burst** for fluency using the machinery we just shipped.

**New work — all content-side except two small engine touches:**
1. **An English noun→picture pool** (the biggest piece). A `RecogWord`-shaped pool per Phase-A/B/C rung:
   `{ word, emoji /* PNG filename stem */, cognate: boolean, category: string, group?: string }`.
   `category` drives Phase-A `en_noun_category` distractors; `group` clusters minimal-pair sets for
   `en_noun_minpair`. Many PNGs already exist under `/public/emoji/` (cat, dog, sun, apple, fish, key,
   egg, star…); the rest must be drawn/sourced into the same pipeline.
2. **Audio clips** — en-GB (Sonia) for every new noun/attribute/verb/phrase, via the existing
   `scripts/spelling-audio` edge-tts pipeline. (Carrier sentences optional here; a clean single word is
   often better for first-contact recognition — decide per phase.)
3. **Engine touch — a `render: 'word'` option kind** (Gap 3) for Phase D "tap the printed word": a new
   `ChoiceOption` variant + one `ChoiceStage` branch rendering a text span (mirrors the `'letter'` branch,
   `ChoiceStage.tsx:201-205`). ~10 lines. Nothing else in the render path changes.
4. **Gating change — split the year gate** (see below).

---

## Gating: ungate the receptive tier, literacy-gate the print/production tier
`englishReady(year) = year >= 3` (`english-content.ts:26-29`) currently keeps English out of the pool
entirely below åk3 — which **excludes the 5yo from the very rungs built for her**. Change:
- **Receptive English (Phases A–C, all `format:'choice'`)** → offered to **everyone with headphones**, exactly
  like Swedish recognition (`mixedSubjectsFor` pushes `'english'` whenever headphones, no year floor). The
  p-band + the seed keep each child at their own rung; the youngest earns A→C in order, an older beginner
  the same.
- **Print + production (Phases D–F)** → gated on **reading readiness**. Cross-subject `requires` can't
  reference a Swedish code (the graph is subject-scoped), so gate these rungs with an
  `englishPrintReady(year)` proxy (e.g. `year >= 1`) until a real letter/reading-readiness probe exists —
  the same honest-proxy stance the Swedish ladder used. A pre-literate child then **caps at the top of
  Phase C** (fluent English *comprehension*) and waits there — which is pedagogically correct, not a
  dead-end.

This is the one behavioural change with reach; everything else is additive content.

---

## Starter vocabulary (Phase A, cognate-first) — concrete enough to build
`en_noun_cognate` (floor) — strong SV↔EN cognates, clear pictures (★ = PNG already present):
`sun`★ `apple`★ `fish`★ `key`★ `star`★ `egg`★ `house` `book` `ball` `hand` `ring` `arm` `milk` `water`
`bed` `boat`(båt) `hat` `lamp`(lampa) `finger` `nose`(näsa).
`en_noun_core` — non-cognate high-frequency: `dog`★ `cat`★ `boy` `girl` `tree` `bird` `car` `cup` `door`
`shoe` `hand` `head` `eye` `toy`.
`en_color`: red green blue yellow black white (rendered as coloured swatch PNGs).
`en_verb_action`: run jump eat sleep sit swim fly drink read.
(Full lists authored in `english-content.ts` at build time; SUBTLEX/Kuperman frequency + picturability +
asset availability decide inclusion, same discipline as the Swedish pools.)

---

## Decisions for Erik
1. **Cognate-first** (recommended, above): lean into SV↔EN cognates for the very first rung so first contact
   feels winnable, then remove the crutch from `en_noun_core` onward. Alternative: mix non-cognates in from
   rung 1 to prevent "sounds-like-Swedish" overreliance. My lean is cognate-first — confidence before rigor.
2. **Audio style for recognition** — single clean word vs the "word. sentence. word." carrier we use for
   spelling. For *picture* recognition a single word is usually clearer; I'd use single words for A–C and
   keep carriers for the production/spelling rungs (E–F). Your call.
3. **Literacy proxy** — `englishPrintReady = year >= 1` to start (holds the 5yo at end-of-Phase-C), refine
   later with a real reading-readiness signal. OK, or a different floor?
4. **Assets** — Phase A alone needs ~20 noun PNGs (≈half already exist) + ~20 en-GB clips. Fine to author
   incrementally (ship Phase A first, then B, C…), since each phase is independently useful.

## Staging (each independently shippable, tablet-checked on the 5yo)
1. **Phase A** — the four receptive-noun rungs + the noun-picture pool + clips + the gating ungate. This
   alone gives the 5yo real English and gives sushi the floor she's missing. Smallest, highest value.
2. **Phase B, then C** — attributes/recombination, then verbs/frames (needs phrase clips + a few composite
   pictures).
3. **Phase D** — the `render:'word'` engine touch + print-bridge rungs (literacy-gated).
4. **Phase E→F** — production rungs, then re-parent the existing `en_ed_regular` onto `en_spell_verb`.

## Engine boundary / stop-flag
Selector, θ, gate, ledger, recognition-crossing, and burst are reused. The only engine change is a
`render:'word'` option variant (Phase D). Everything else is content + the one gating split. **Stop-flag:**
if any rung wants the selector or θ to reason about *subject* or *cognate-ness*, stop and reassess — the
A11 boundary holds (the selector stays subject-blind; only seed grade and pool source are subject-aware).
