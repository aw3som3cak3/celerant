# Swedish spelling — human-voice recording manifest

A written shot-list so whoever sits at the mic does it **once**. These are the items where
**TTS is not trustworthy** and a human ear is mandatory (A5/A12): vowel-**length** (T3) and
vowel-**quality** (T4 o/å, e/ä) are exactly where synthetic Swedish drifts. T2's transparent
words are *not* here — they ship on TTS. Batch T3 and the T4 vowel sets in **one session**.

## Recording spec (read once, applies to every clip)
- **One voice**, one session, one room. A parent's own voice is fine — for a five-year-old,
  arguably better. Whose Swedish the kids hear is a real choice; make it deliberately.
- **Child-directed register**: natural pace, clear, warm — how you'd say the word *to* the
  child, not a dictionary citation. No trailing "…?", no over-articulation of the doubled
  consonant (that would give the answer away).
- **Isolated word/phoneme**, no carrier sentence. Say the target and stop.
- **Format**: mono, 44.1 kHz, WAV (we downconvert). ~0.5 s of silence head and tail; trim later.
- **File naming**: `spelling/<tier>/<canonical-lowercase>.wav` — e.g. `spelling/t3/vitt.wav`,
  `spelling/t4_oa/båt.wav`. The canonical **is** the answer key, so the filename must match the
  stored lower-case form exactly (å ä ö included).
- **Verify on the actual tablet**, not headphones at the desk — a muted or too-quiet clip is
  the sprint-input bug in new clothes (a child staring at a screen that asked them nothing).

---

## T3 — vowel length / consonant doubling  *(REQUIRED for the T2→T3 slice)*
Minimal pairs; the whole point is that the **only** audible difference is vowel length. Record
**both** members of every pair in the same breath so the contrast is one voice, one moment.

| short vowel + double cons. | long vowel + single cons. |
|---|---|
| vitt | vit |
| matt | mat |
| hall | hal |
| tack | tak |
| full | ful |
| sill | sil |
| lamm | lam |
| kall | kal |
| villa | vila |
| fett | fet |
| hett | het |

11 pairs = **22 clips**. (Split practice/holdout at authoring time, not at the mic — record all 22.)

---

## T4 · o/å — vowel quality  *(batch now; not in the slice but same mic session)*
The sound doesn't tell the child which letter; the spelling must be retrieved/ruled. Record a
spread of both spellings.

- **å-spelled:** båt · gås · mål · hål · blå · tå · år · ås
- **o-spelled:** sol · bok · ros · ost · ko · kol · lok · son

16 clips.

## T4 · e/ä — vowel quality  *(batch now)*
- **ä-spelled:** häst · träd · äta · bär · väg · känna · säng · näsa
- **e-spelled:** ben · sten · hel · ren · se · vem · det · fem

16 clips.

---

## OPTIONAL — isolated phoneme inventory  *(grab while the mic is warm; for T0/T1 later)*
Isolated Swedish phonemes come out **wrong** from TTS — this is the other unavoidable human-voice
asset, needed if/when we build T0 (phonological awareness) and T1 (letter–sound). Not needed for
the T2→T3 slice; record only if the voice has time. Say the **sound**, not the letter name
(`/s/` as in *sol*, not "ess").

- **Consonants:** /s/ /m/ /l/ /r/ /t/ /n/ /p/ /k/ /f/ /v/ /h/ /g/ /b/ /d/ /j/
- **Vowels (long):** /a:/ /e:/ /i:/ /o:/ /u:/ /y:/ /å:/ /ä:/ /ö:/

`spelling/phoneme/<label>.wav` — labels ASCII-safe: `s, m, … , vowel_a_long, vowel_aa_long (å), …`.

---

## What this unblocks
- **Slice (T2→T3):** T2 runs on TTS today; T3 needs the 22 clips above before it goes fully live.
  Increments 2–3 (LetterPad, subject scoping) do **not** wait on any of this.
- **Batching:** recording T3 + both T4 vowel sets (54 clips) in one sitting means the mic is
  visited once for everything TTS can't be trusted on through T4.
- **Seed reminder:** the letters/min aim is a placeholder (`10 + 3·grade`, n=0) — treat the first
  slice sessions as calibration data for it, do not trust it past first contact.
