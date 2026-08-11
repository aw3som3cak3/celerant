# Finalize the expanded RECOGNITION transparent pool (T1 first-letter, T0b segmentation, T1b final
# letter, T1c the vowel) from the espeak-validated single-vowel candidates. Single-vowel + 1:1 +
# NO o/å (o/å are quality traps — the letter ≠ the sound, wrong for vowel recognition). espeak gives
# the phoneme count; the vowel is the sole vowel letter. Prints  word<TAB>sounds<TAB>vowel  and the
# NEW words still needing an isolated /recog/ clip.

import os, io, re

PIPER = r'C:\Users\eriko\git\celerant\work-materials\tts\piper'
os.environ['PHONEMIZER_ESPEAK_LIBRARY'] = os.path.join(PIPER, 'espeak-ng.dll')
os.environ['ESPEAK_DATA_PATH'] = PIPER
from phonemizer.backend import EspeakBackend
from phonemizer.separator import Separator

HERE = os.path.dirname(os.path.abspath(__file__))
VOWELS = set('aeiuyäö')  # note: NO o/å (quality traps) and they're excluded from the pool anyway
T3 = set('vit vitt mat matt hal hall tak tack ful full sil sill lam lamm tal tall vila villa fet fett het hett'.split())
STRIKE = set(
    'sir new the sam david frank john tom max jack mike bob joe harry anna maria emma '
    'typ dum hemskt fan skit sex '
    'nåt nån sån vem hur var vad när sen dig mig sig din min vår väl fli fri '  # function leftovers
    'lnte fbi clark gud guds dumt drink svär bar drar'.split())  # OCR junk / acronyms / names / adult / dupes
KEEP_ORIG = 'sol mus bil hus ris ros val tåg båt ko räv våg hund häst fisk'.split()  # current 15 (o/å ones drop out below)

cands = [w.strip() for w in io.open(os.path.join(HERE, 'pool_single_vowel.txt'), encoding='utf-8') if w.strip()]
# merge current pool first (those without o/å survive), then new candidates by frequency
seen = set(); ordered = []
for w in KEEP_ORIG + cands:
    if w in seen: continue
    seen.add(w)
    if 3 <= len(w) <= 6 and not re.search(r'[oå]', w) and w not in STRIKE and w not in T3 \
       and sum(c in 'aeiouyåäö' for c in w) == 1:
        ordered.append(w)

be = EspeakBackend('sv')
sep = Separator(phone='|', word=' ', syllable='')
out = io.open(os.path.join(HERE, 'final_recog.tsv'), 'w', encoding='utf-8')
newwords = []
kept = 0
for w in ordered[:110]:
    ipa = be.phonemize([w], separator=sep, strip=True)[0]
    n = len([p for p in ipa.split('|') if p])
    if n != len(w):  # espeak says not 1:1 → skip (belt and suspenders)
        continue
    vowel = next(c for c in w if c in 'aeiouyåäö')
    out.write(f"{w}\t{n}\t{vowel}\n")
    kept += 1
    if not os.path.exists(os.path.join(r'C:\Users\eriko\git\celerant', 'public', 'audio', 'spelling', 'recog', w + '.mp3')):
        newwords.append(w)
out.close()
io.open(os.path.join(HERE, 'final_recog_newwords.txt'), 'w', encoding='utf-8').write('\n'.join(newwords))
print(f"kept={kept} new_needing_audio={len(newwords)}")
