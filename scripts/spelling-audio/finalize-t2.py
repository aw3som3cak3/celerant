# Finalize the expanded T2 bank from the espeak-validated candidate pool (pool_t2.txt): drop an
# Erik-approved strike set (English junk, dark words, abstract adverbs/function words), merge the
# original hand-vetted 34 (which keep their carrier-sentence audio), split practice(120)/holdout(40)
# DISJOINT. Prints the two lists + the NEW words that still need an isolated audio clip.

import os, io

HERE = os.path.dirname(os.path.abspath(__file__))
STRIKE = set(
    'sir new the '                                                   # English / junk
    'hatar galen gud '                                              # Erik's nod
    'precis ganska nästan medan förut direkt iväg undan nere runt fast reda dags antar '  # abstract adverbs
    'sen tag dra ses enda nya verkar menar bryr '                   # function-ish / abstract
    'sam david frank john tom max jack mike bob joe harry charlie george paul peter anna maria emma '  # names (lowercased in the list)
    'typ dum hemskt '                                                # slang / negative
    'vit vitt mat matt hal hall tak tack ful full sil sill lam lamm tal tall vila villa fet fett het hett'.split())  # T3 pair members — must not leak into T2

ORIG_PRACTICE = 'bil gris pris ris lim tid liv hus mus ben ren sten rik is lek sida resa fara gata läsa näsa äta rita'.split()
ORIG_HOLDOUT = 'ny by sy yta räv träd fira rida leva myra leka'.split()

cands = [w.strip() for w in io.open(os.path.join(HERE, 'pool_t2.txt'), encoding='utf-8') if w.strip()]
cands = [w for w in cands if w not in STRIKE]

# Merge, de-dup preserving order: originals first (audio already exists), then new by frequency.
def dedup(seq):
    seen = set(); out = []
    for w in seq:
        if w not in seen:
            seen.add(w); out.append(w)
    return out

allw = dedup(ORIG_PRACTICE + ORIG_HOLDOUT + cands)
practice = allw[:120]
holdout = allw[120:160]

orig = set(ORIG_PRACTICE) | set(ORIG_HOLDOUT)
new_words = [w for w in practice + holdout if w not in orig]

io.open(os.path.join(HERE, 'final_practice.txt'), 'w', encoding='utf-8').write(' '.join(practice))
io.open(os.path.join(HERE, 'final_holdout.txt'), 'w', encoding='utf-8').write(' '.join(holdout))
io.open(os.path.join(HERE, 'final_newwords.txt'), 'w', encoding='utf-8').write('\n'.join(new_words))
print(f'practice={len(practice)} holdout={len(holdout)} new_needing_audio={len(new_words)}')
