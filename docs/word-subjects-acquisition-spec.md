# Acquisition for the word subjects — teaching spelling & English, not just testing them

Status: SPEC (2026-08-14). Extends scaffolded acquisition (maths) to Swedish spelling and
English. Self-contained for a fresh builder. Read `docs/scaffolded-acquisition-spec.md` and
`src/lib/acquisition-content.ts` / `src/lib/acquisition.ts` / `src/app/_components/AcquisitionStage.tsx`
first — this spec adds to that engine, it does not replace it.

## 0. The problem, and the reframe that solves it

Scaffolded acquisition teaches a maths fact by walking the child through a **derivation** from
sub-facts she's already fluent on, then fading the support (`L0` full → `L3` bare). The training
gap-map showed this is an **arithmetic** phenomenon: spelling and English don't decompose into
fluent sub-facts, so the derivation-fade doesn't apply, and those graphs are "grey" — teachable-
by-nothing in the current engine.

**THE REFRAME (make it the principle here):** the maths scaffold is not "training" in general —
it is ONE instance of a single primitive: **fade the support, from a fully-modelled example to
independent recall.** What is faded differs by skill *type*. Abstracting "the support is a
derivation" away, the SAME engine (trigger, fade schedule `L0→L3`, warmup-class θ, graduation,
the `acquisitionCodes` selector touch) teaches anything — you add new **support-types**, not a
new engine. The word subjects need the two the research names, both well-established:

- **Rule-application-fade** — Direct Instruction (Engelmann; and celerant's spelling is already
  based on the DI programme *Spelling Through Morphographs*). For rule-governed patterns: model
  the rule on a worked example, fade the prompt to independent application.
- **Cue-fade + elaboration** — errorless learning. For genuinely atomic items: show the item,
  progressively hide it; where possible hook it to meaning (morphology).

Both are the fade primitive; only the support changes. "Grey on the map" means *derivation
doesn't apply*, NOT *can't be taught*.

## 1. The two support-types in detail

### A. Rule-application-fade  (rule-governed spelling & grammar)
The support is a **rule-application walk** — the discrimination/decision the rule turns on, then
the action, then the produced form. The child *applies* the rule under fading prompts (DI), so
she generalises rather than memorising a word.

Example, Swedish doubling (`spelling_t3`, "dubbelteckning") for *vitt*:
```
L0 full    hör du kort vokal?  → [ja]     (a tap — the discrimination)
           dubbla konsonanten  → vitt      (produce on the letter pad — the target)
L1 partial vi__ →  ___                       (rule already flagged; she supplies the doubling)
L2 cued    (dictation) with a quiet tip: "kort vokal → dubbla"
L3 bare    dictation, no support = the ordinary rung
```
Where the rule genuinely *branches* (English `-ed`: *hop→hopped* double / *like→liked* drop-e /
*jump→jumped* add), the `L0` discrimination is a real choice with non-examples — the strongest
form of the walk. A non-branching rule (Swedish doubling) is a **procedure walk** (segment →
hear the short vowel → double → write); still a valid rule-fade, just without a yes/no fork.

### B. Cue-fade + elaboration  (atomic lexical items)
The support is **the item itself, progressively hidden** — errorless, because she is never asked
to recall what she has not seen; the cue thins as she internalises it.

Example, an English irregular past (`en_past_irregular`, *went*):
```
L0 full    shows  went   → she copies it on the letter pad
L1 partial shows  w__t   → she fills the gap
L2 cued    shows  w___   (first letter + length), or the word flashed then hidden
L3 bare    dictation, no cue = the ordinary rung
```
**Elaboration** is the optional hook: where a word decomposes morphologically (base + affix,
which recur — `o+vän+lig`), show the morphemes at `L0`. A keyword/mnemonic hook is item-specific
and NOT auto-generatable — author it for the stubborn few, else the grownup-alert fallback.

## 2. The data trigger — per support-type

Reuse the maths trigger (`acquisition.ts`) unchanged. The one difference is the readiness veto:

- **Rule-application:** has a fluent-input veto, like maths. The inputs are "she owns the parts
  the rule joins" — she can spell/produce the base and knows the affix; she is failing the
  JOINING. Declare these as the derivation's `inputs`; the existing `inputs.every(isFluent)`
  veto then works untouched. If an input isn't fluent, don't scaffold — the graph drops lower.
- **Cue-fade:** has NO fluent-input veto — an atomic item derives from nothing. Declare
  `inputs: []`; the existing veto (`[].every(...) === true`) auto-passes. Ignition is then just:
  failed-but-not-graduated, gated by the reading cross-gate (§5). This is correct — the whole
  point is to teach the word by re-presenting it faded, so any failed atomic item is eligible.

## 3. Rendering — the main new work (AcquisitionStage generalises)

The maths `AcquisitionStage` drives `InputStage` (numpad) only. Word subjects need it to render:
- **Discrimination sub-steps** as CHOICE taps — reuse `ChoiceStage` (`src/app/_components/ChoiceStage.tsx`).
  A wrong/`idk` sub-step reveals its value and carries on, INERT (no ledger, no θ) — exactly the
  maths `L0` sub-step contract.
- **Production targets** on the LETTER PAD — `InputStage` already has a letter-pad mode (used by
  spelling dictation; pass the tier's letters). The final target is graded normally by `grade()`.
- **A cue display** for cue-fade — the progressively-hidden word rendered as `promptNode` above
  the letter pad.

So `AcquisitionStage` goes from "numpad sub-steps" to "sub-steps that are a choice-tap OR a
letter-pad entry, plus an optional cue node." Reuse ChoiceStage + the existing letter-pad mode;
do NOT build a third input surface. Only the FINAL target is a recorded attempt; sub-steps stay
inert (the maths invariant, unchanged).

## 4. Engine integration (A11 holds — same as maths)

- New content structure `WORD_DERIVATIONS` / `WORD_BY_CODE` alongside `DERIVATIONS` (mult),
  `ADDITIVE_DERIVATIONS`, `RULE_DERIVATIONS` — same registration pattern the maths build proved.
  Each carries `{id, inputs, kind:'rule'|'cuefade', build(...)→ {substeps, cue?, target}|null}`.
  A builder that can't form a clean walk returns `null` → `AcquisitionStage` falls back to the
  bare item (child never stuck) — the grade-identical guard, generalised: a rule-walk's final
  step must equal the item's real answer, or return `null`.
- `hasDerivation` / `pickDerivation` consult the new structure too; `hintFor` / `STRATEGY_COPY`
  get one entry per new strategy (sv + en).
- **Generation-layer only.** No change to the selector, θ-update, fluency gate, or ledger beyond
  the existing `acquisitionCodes` touch. θ is warmup-class (weak-up on success, none on miss,
  never a rate measure). Graduation is the existing monotonic `L3`-held rule. If a support-type
  needs the engine to REASON about something new, STOP and report.
- **Cross-subject gating (first-class principle — `crossRequires` / `READING_READY`):** every
  word-subject acquisition is reading-dependent, so a scaffolded rung is reading-gated exactly as
  its parent skill is. A pre-reader is never handed a faded word.

## 5. The two first slices (prove the primitives, then generalise)

1. **Rule-application-fade — Swedish `spelling_t3` doubling.** Highest immediate impact (the kids
   do spelling now), a clean doubling rule → a procedure walk (segment → short vowel → double →
   write). Inputs: the base is spellable + the doubling context is heard.
2. **Cue-fade — English `en_past_irregular`.** The purest atomic case (no rule to apply), so it
   is the honest proof of the cue-fade primitive: whole word → gapped → first-letter → dictation.
   `inputs: []`.

Prove BOTH loops end-to-end on these two before authoring a library. **Immediate generalisations
once proven:** rule-walk → English `-ed` (`en_ed_regular`, where the rule branches double/drop-e/
add — the richer discrimination form) and Swedish `spelling_t2` phonics (segment-and-spell walk);
cue-fade → any future atomic tier. Do NOT open all of spelling/English at once.

## 6. Invariants / guardrails
1. **Fluency stays honest** — warmup-class, never a rate measure; a faded latency must never
   pollute the aim.
2. **Errorless & non-punitive** — cue-fade never asks her to recall an unseen item; a fumbled
   sub-step reveals and carries on, never marks. Motivation guardrails (witness, no score) hold.
3. **Readiness is real** — rule-walk fires only when the joined parts are fluent; cue-fade only
   past the reading gate. Never teach a rule on parts she lacks.
4. **One recorded attempt per served item** — sub-steps inert; the final target graded as today.
5. **A11** — generation-layer + the narrow rendering additions; θ/gate/selector untouched.

## 7. Open questions for the builder
- Cue-fade gapping schedule: which letters to hide at `L1` (hardest? every other? the rule-bearing
  one?) and how `L2` shows "first letter + length" vs a flash-then-hide.
- Rule-walk discrimination for a non-branching rule (Swedish doubling): is the "kort vokal?" tap
  worth keeping as a real step, or does the procedure walk start at "double it"? Decide from what
  actually teaches.
- Morphological elaboration: which words decompose cleanly enough to show morphemes at `L0`, and
  where that's noise.
- Whether Swedish `spelling_t3`'s all-doubling pool needs non-examples pulled in (from `t2`) to
  make the discrimination honest, or whether the procedure walk suffices.
