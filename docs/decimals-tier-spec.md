# Decimals tier — implementation spec

Status: **approved; increments 1–2 SHIPPED 2026-08-06** (deploy 5a06fbe, 79dd61d). All
5 open decisions approved as recommended. Scope: **Standard** (9 skills, Lgr22 åk4–6).
**Done:** infra + `dec_read_tenths`, `dec_add_same`, `dec_sub_same` (inc 1) + `dec_x10`,
`dec_div10`, `dec_add_carry` (inc 2). **Increment 3 pending:** `dec_add_align`,
`dec_sub_borrow`, `dec_times_whole` (see §11).

The maths graph runs GROUND → additive → place value → mult → div → order-of-ops →
negatives → fractions → linear, and has **no decimals** — excluded at the type level
(`Answer = int | frac | word`, skills.ts:14 "Answers are exact. Never a decimal.").
For åk4–6 ("tal i decimalform", Lgr22 central content) that is a real curriculum gap.

---

## 1. The exactness resolution (reconciling "never a decimal")

The line 14 principle is really **never an *inexact* answer** — floats break exact
grading (`0.1 + 0.2 ≠ 0.3`). It does **not** need to forbid decimal *content*, because:

- The grader already works in **exact rationals** (`grade` → `parseRational`, compare in
  lowest terms). Ints, negatives, and `a/b` fractions all round-trip exactly today.
- **Every terminating decimal is an exact rational**: `0,5 = 1/2`, `3,25 = 13/4`,
  `0,07 = 7/100`. All decimal answers in this tier terminate by construction.

**Decision: decimals are stored and graded as exact rationals; decimal notation appears
only in what the child reads and types. No float is ever introduced.** The principle
holds in spirit — we keep "never an inexact answer." Update the skills.ts:14 comment to
say so.

---

## 2. Answer model (`src/skills.ts`)

Add a fourth `Answer` kind, storing an exact scaled integer:

```ts
| { kind: "dec"; v: number; scale: number } // exact value = v / 10^scale, scale ≥ 1
```

Constructor **normalises to the minimal scale** (strip trailing zeros) so the canonical
form is natural — `dec(70, 2)` → `dec(7, 1)` → `"0,7"`, never `"0,70"`:

```ts
const dec = (v: number, scale: number): Answer => {
  while (scale > 0 && v % 10 === 0) { v /= 10; scale--; }   // 3,50 → 3,5
  return scale === 0 ? { kind: "int", v } : { kind: "dec", v, scale }; // whole → int
};
```

`answerToString` (skills.ts:817) gains a `dec` branch — Swedish **comma**:

```ts
if (a.kind === "dec") {
  const p = 10 ** a.scale, abs = Math.abs(a.v);
  return `${a.v < 0 ? "-" : ""}${Math.floor(abs / p)},${String(abs % p).padStart(a.scale, "0")}`;
}
```

---

## 3. Grading (`src/lib/grade.ts`)

Extend `parseRational` to accept decimal notation (comma **or** point — a child may type
either; canon is always comma). Insert **before** the int/frac branches:

```ts
const d = s.match(/^(-?)(\d+)[.,](\d+)$/);
if (d) {
  const sign = d[1] === "-" ? -1 : 1;
  const n = sign * parseInt(d[2] + d[3], 10);
  const den = 10 ** d[3].length;
  const g = gcd(n, den);
  return { n: n / g, d: den / g };
}
```

Consequences (all correct-by-value):
- `"3,5"`, `"3.5"`, `"3,50"` all → `7/2` → match `dec(35,1)`. Trailing zeros forgiven.
- A child who answers a decimal item with the equal **fraction** `"7/2"` also matches
  (see Open decision A — recommend keeping this; it's the model, and `3÷4 = 0,75` is a
  true relation we don't want to punish).
- Rejects `"3,"`, `",5"`, `"3,,5"` (both sides required).

---

## 4. Input surface

**`AnswerInput.tsx` — `inputModeFor`:** add `'decimals'` to the `'text'` families (the
comma is not on a numeric soft-keypad):

```ts
return ['fractions','negatives','linear','decimals'].includes(family) ? 'text' : 'numeric';
```

**`InputStage.tsx` — numpad:** today `allowSign` swaps in a `−`/`/` row. Add an
`allowDecimal` flag (derived `family === 'decimals'`) that swaps in a **comma** key:

```
allowSign    → ['1'..'9', '−', '0', '/']
allowDecimal → ['1'..'9', ',', '0',  ⌫ ]    // no minus: åk4–6 decimals are non-negative
else         → ['1'..'9', null,'0', null]
```

`keydown` accepts `','` and `'.'` when `allowDecimal` (both insert `','`); `press(',')`
appends. Physical keyboard `,`/`.` feed the same path.

---

## 5. Fluency aim / keystroke counting (`src/lib/item.ts`)

The comma is a real keystroke and must not be invisible to the motor budget:

- `answerLengthOf` (digits-only, drives sprint auto-submit) — **leave as-is**: `"3,5"` →
  2, and the child taps `3 , 5`, so `digitCount` reaches 2 exactly when the last digit
  lands. Auto-submit still fires on the completing tap. ✓ (comma is transparent here).
- `expectedPhysicalDigits` — **add the separator**: a decimal answer's demonstrated
  keystroke throughput must count the comma, else the tap-ceiling floor is undercounted.
  Count digits **+ 1 per comma** for `dec` answers.
- `motorDigitsOf` — charge the comma as a **cheap patterned key** (reuse
  `TRAILING_ZERO_COST` ≈ 0.25): it's a fixed, non-retrieval keystroke, like a trailing
  zero. Minor, but keeps the aim honest.

---

## 6. The ladder (family `"decimals"`, Standard scope)

Nine seams, each one element-interactivity step. Answers `dec(...)` unless whole
(`int`). Generators draw operands so **no single answer exceeds the verify 40% dominance
cap** (spread the tenths/operands uniformly).

| # | code | year | seam | prereqs | example → answer |
|---|------|------|------|---------|------------------|
| 1 | `dec_read_tenths` | 4 | a decimal *is* tenths | `add_2d_no_carry` | `6/10 =` → `0,6` |
| 2 | `dec_add_same` | 5 | add, same places, no carry | `dec_read_tenths` | `0,3 + 0,4 =` → `0,7` |
| 3 | `dec_sub_same` | 5 | subtract, same places, no borrow | `dec_add_same` | `4,7 − 1,2 =` → `3,5` |
| 4 | `dec_x10` | 5 | ×10/×100 = shift left | `dec_read_tenths`, `mult_by_powers_of_ten` | `0,4 × 10 =` → `4` |
| 5 | `dec_div10` | 5 | ÷10/÷100 = shift right | `dec_x10` | `35 ÷ 10 =` → `3,5` |
| 6 | `dec_add_carry` | 5 | carry across the comma | `dec_add_same`, `add_cross_10` | `0,7 + 0,5 =` → `1,2` |
| 7 | `dec_add_align` | 6 | add unlike places (align comma) | `dec_add_carry` | `1,2 + 0,35 =` → `1,55` |
| 8 | `dec_sub_borrow` | 6 | subtract with borrow / unlike places | `dec_sub_same`, `sub_cross_10` | `1,2 − 0,45 =` → `0,75` |
| 9 | `dec_times_whole` | 6 | decimal × whole number | `dec_add_carry`, `mult_2d_by_1d_no_carry` | `0,3 × 4 =` → `1,2` |

Notes on the seams:
- **#1** is the notation-and-meaning gate: shown a tenths fraction, type the decimal.
  Draw `n ∈ 1..9` (answer `0,1..0,9`, uniform → no dominance). Ties to fractions in
  *content* but takes NO fraction prereq — decimals are year 4, the frac tier is 5–6, so
  a hard frac edge would invert the year order. (Open decision D on the prompt form.)
- **#4/#5** are the trailing-zero/place-shift skills — expect the motor discount to pull
  their expected-digits well below raw length, exactly as `mult_by_powers_of_ten` does.
- **#7** is where hundredths meet tenths (align the comma) — the classic error site.
- **#9** stops at decimal × *whole*; decimal ÷ whole and the fraction↔decimal bridge are
  the **Full** scope, deferred (out of Standard).

---

## 7. Graph integration

- New `tierDecimals` block in `skills.ts`, inserted into `SKILLS` after `tier2` (place
  value) — its prereqs reach back into place value, `mult_by_powers_of_ten`, and the
  cross-10 carry/borrow skills; it does **not** gate behind fractions.
- `family: "decimals"` throughout (new family string). It groups on the map and parent
  overview like any other family.
- Seeding: new component skills auto-seed θ for every player (`computeAbility` walks all
  SKILLS). But their provisional **rate** needs a seed — add a guarded one-off
  `bridge_decimals_v1` in `runOneOffPlacements` that replays all players so the new codes
  get provisional rates. **Do NOT bump `MODEL_VERSION`** (that re-runs the stale
  hardcoded grade sets — see the on-ramp deploy note).

---

## 8. Register checklist — every site that must honour the new kind/family

The spelling work proved SKILLS is walked in ~8 places and a partial change silently
leaks. For decimals the risk is the **`dec` Answer kind** and the **`decimals` family**:

1. `skills.ts` — `Answer` union · `dec()` constructor · `answerToString` · the 9 skills ·
   `tierDecimals` in `SKILLS`.
2. `lib/grade.ts` — `parseRational` comma branch.
3. `lib/item.ts` — `expectedPhysicalDigits` (+ separator) · `motorDigitsOf` (comma cost) ·
   confirm `answerLengthOf` auto-submit (no change).
4. `_components/AnswerInput.tsx` — `inputModeFor` adds `decimals`.
5. `_components/InputStage.tsx` — `allowDecimal` comma key + keydown.
6. `lib/labels.ts` — 9 Swedish labels (below) + the coverage-guard test stays green.
7. `lib/verify.ts` + `test/verify.test.ts` — the `dec` kind in the magnitude branch
   (value = `v / 10^scale`); dominance check reads `answerToString` (already fine).
8. `db/replay.ts` / `runOneOffPlacements` — `bridge_decimals_v1` provisional-seed one-off.
9. Map / parent overview — confirm the `decimals` family renders in the ladder grouping.
10. `NON_SPRINTABLE` — leave decimals **sprintable** (fluency content), given §5's comma
    handling. (Open decision C.)

---

## 9. Swedish labels (`lib/labels.ts`)

```
dec_read_tenths : 'tiondelar som decimal'
dec_add_same    : 'decimaltal plus'
dec_sub_same    : 'decimaltal minus'
dec_x10         : 'gånger 10 och 100'
dec_div10       : 'delat med 10 och 100'
dec_add_carry   : 'decimalplus med minne'
dec_add_align   : 'plus, olika decimaler'
dec_sub_borrow  : 'decimalminus med lån'
dec_times_whole : 'decimaltal gånger heltal'
```

---

## 10. Testing plan

- **grade.test** — `"3,5"`/`"3.5"`/`"3,50"` all match `dec(35,1)`; `"7/2"` matches (value);
  reject `"3,"`, `",5"`, `"3,,5"`; canon `answerToString(dec)` = `"0,7"` not `"0,70"`.
- **verify.test** — each of the 9: exact rational round-trip, no answer >40% (dominance),
  sane magnitude, `expectedAnswerDigits` in a plausible range.
- **item/input** — comma key inserts; keydown accepts `,` and `.`; `expectedPhysicalDigits`
  counts the comma.
- **graph** — prereq edges resolve; unlock chain `dec_read_tenths → … → dec_times_whole`
  matches `computeUnlocked`; labels-coverage guard covers all 9.

---

## 11. Build increments (on approval)

1. **Infra + entry (ship):** `dec` kind · `dec()` · `answerToString` · `parseRational`
   comma · `inputModeFor` · numpad comma key · digit/motor comma · `dec_read_tenths`,
   `dec_add_same`, `dec_sub_same` · `bridge_decimals_v1` · tests.
2. **Place shift + carry:** `dec_x10`, `dec_div10`, `dec_add_carry`.
3. **Unlike places + product:** `dec_add_align`, `dec_sub_borrow`, `dec_times_whole` ·
   labels · map/verify confirmed.

---

## 12. Open decisions for Erik

- **A. Accept an equal fraction as input to a decimal item** (`7/2` for a `0,5`-type)?
  *Recommend yes* — grading is by value, and the fraction↔decimal equality is a truth we
  shouldn't punish. Enforcing decimal notation would be a new, separate concern.
- **B. Accept `.` as well as `,` on input?** *Recommend yes* (canon always `,`); kids type
  either, and it costs nothing.
- **C. Decimals sprintable (fluency/diploma path) from the start,** or accuracy-first for a
  while? *Recommend sprintable* — it's fluency content and §5 handles the comma.
- **D. `dec_read_tenths` prompt form:** `6/10 =` (fraction→decimal, recommended — concrete,
  no hard frac prereq) vs `6 tiondelar =` (words) vs a marked number line.
- **E. Confirm no fraction prereq** (year-order: decimals 4–6, fractions 5–6). *Recommend
  confirm* — keep decimals reachable at year 4 without the frac tier.
