# Swedish spelling — recording script (one take)

Read this straight through into your phone. It records every audio clip the spelling pack
needs that TTS can't be trusted on: **T3** vowel-length pairs (required for the live slice),
the **T4** o/å and e/ä vowel-quality sets (batched now), and an **optional** phoneme inventory
at the end you can skip if short on time.

Source of truth: `docs/spelling-recording-manifest.md`. This script covers exactly what it
lists — nothing invented, nothing dropped.

- **54 items required** (T3 + T4) · **+24 optional** phonemes = **78 max**
- **Reading time:** ~4 minutes for the 54 required, ~6 minutes for all 78.

---

## How to read it

- **Read straight down, in order, one word per breath.** The line number is the clip number —
  if you skip one, every later clip mislabels, so don't reorder or skip.
- **Leave a CONSISTENT ~1.5 second silence between items** — the same clear beat every time
  (say the word, then silently think *"tusen-ett, tusen-två"* before the next). Consistency
  matters more than length: a gap that's sometimes short merges two clips into one. Start and
  end the whole recording with ~1.5 seconds of silence too.
- **Don't rush items 55–78** (the single phonemes) — they're short, so give them the *same*
  full gap; they're the easiest to run together.
- **Set the phone down at a fixed distance and don't touch it mid-take** — handling noise
  between words looks like speech to the splitter.
- **Read only the bold word.** The grey cue to the right is for your eye, never spoken.
- **Child-directed voice:** natural, warm, how you'd say it *to* a kid — not a dictionary
  citation. Do **not** over-stress the doubled consonant in T3; the only difference the child
  should hear is the **vowel length**. No trailing "…?".
- **Quiet room, no hum.** Hold the phone ~20–30 cm away, normal speaking volume, keep the
  distance steady across the whole take.
- **If you fumble a word, don't stop.** Pause a beat, say it again cleanly, carry on — a stray
  double is easy to drop later. Note nothing.

---

## Script

### T3 — vowel length / consonant doubling  *(REQUIRED — the live slice)*
Each pair is **long vowel, then short vowel**, adjacent. Same warm breath for both; let the
vowel length be the only difference.

1. **vit** — *långt i*
2. **vitt** — *kort i*
3. **mat** — *långt a*
4. **matt** — *kort a*
5. **hal** — *långt a*
6. **hall** — *kort a*
7. **tak** — *långt a*
8. **tack** — *kort a*
9. **ful** — *långt u*
10. **full** — *kort u*
11. **sil** — *långt i*
12. **sill** — *kort i*
13. **lam** — *långt a*
14. **lamm** — *kort a*
15. **kal** — *långt a*
16. **kall** — *kort a*
17. **vila** — *långt i*
18. **villa** — *kort i*
19. **fet** — *långt e*
20. **fett** — *kort e*
21. **het** — *långt e*
22. **hett** — *kort e*

### T4 · o/å — vowel quality  *(batch now; not in the live slice)*
Say each word plainly; the point is which letter spells the sound.

**å-spelled:**
23. **båt**
24. **gås**
25. **mål**
26. **hål**
27. **blå**
28. **tå**
29. **år**
30. **ås**

**o-spelled:**
31. **sol**
32. **bok**
33. **ros**
34. **ost**
35. **ko**
36. **kol**
37. **lok**
38. **son**

### T4 · e/ä — vowel quality  *(batch now)*

**ä-spelled:**
39. **häst**
40. **träd**
41. **äta**
42. **bär**
43. **väg**
44. **känna**
45. **säng**
46. **näsa**

**e-spelled:** *(clear /eː/ → e. Deliberately NO de / dem / det / dom — those are spelled by
grammar, not sound, so dictation can't teach them; they'd be a future usage/cloze skill.)*
47. **ben**
48. **sten**
49. **hel**
50. **ren**
51. **se**
52. **vem**
53. **tre**
54. **fem**

---

### OPTIONAL — isolated phonemes  *(skip if short on time; for T0/T1 later)*
Say the **sound**, not the letter name — `/s/` as in *sol*, never "ess". The example word in
grey is just a reminder of the sound; say only the sound.

**Consonants (the sound):**
55. **/s/** — *sol*
56. **/m/** — *mor*
57. **/l/** — *lok*
58. **/r/** — *ros*
59. **/t/** — *tak*
60. **/n/** — *ny*
61. **/p/** — *pil*
62. **/k/** — *ko*
63. **/f/** — *fem*
64. **/v/** — *vit*
65. **/h/** — *hus*
66. **/g/** — *gås*
67. **/b/** — *båt*
68. **/d/** — *dag*
69. **/j/** — *ja*

**Long vowels (the sound):**
70. **/a:/** — *mat*
71. **/e:/** — *fet*
72. **/i:/** — *vit*
73. **/o:/** — *bok*
74. **/u:/** — *ful*
75. **/y:/** — *ny*
76. **/å:/** — *båt*
77. **/ä:/** — *äta*
78. **/ö:/** — *öra*

---

## What file to send back

- **A phone voice-memo is fine.** `.m4a`, `.wav`, or `.mp3` all work — I downconvert.
- **One continuous file**, the whole read in order. Do **not** record per-word files.
- **Mono or stereo both fine** (I downmix to mono). Any sample rate a phone gives (44.1 kHz+)
  is plenty.
- **Even, close, normal volume** — the same distance and loudness throughout, no clipping, no
  background hum. A quiet room beats a good mic.
- **Drop it at** `audio-src/spelling-take-1.m4a` in the repo (create the `audio-src/` folder), or
  put it anywhere and tell me the path — whichever is easier. Keep the `-take-1` in the name so a
  re-record is `-take-2` and never overwrites.

The clip → word mapping is this script's numbering (line number = clip index), grouped by tier;
the slicer step reads it after you hand the file back. Files will be named by their canonical
word per tier, e.g. `spelling/t3/vitt.wav` — but that's my job, not yours.

---

## Counts

| Section | Items | Required? |
|---|---|---|
| T3 vowel-length pairs | 22 | ✅ yes (live slice) |
| T4 o/å | 16 | batch now |
| T4 e/ä | 16 | batch now |
| **Subtotal** | **54** | **the take** |
| Optional phonemes | 24 | skip if short |
| **Total** | **78** | — |
