# Find T3 minimal pairs (vowel length / consonant doubling) automatically: a SHORT form (doubled
# consonant, short vowel) whose LONG form (single consonant, long vowel) is ALSO a real word,
# differing ONLY by the doubling. The frequency list is the "is it a real word" oracle; espeak-ng
# confirms the vowel-LENGTH contrast (long vowel ː in the long form, not the short) — the whole
# point of T3. Prints  long<TAB>short<TAB>freq  for Erik to vet (both real, common, kid-words).

import os, io, re

PIPER = r'C:\Users\eriko\git\celerant\work-materials\tts\piper'
os.environ['PHONEMIZER_ESPEAK_LIBRARY'] = os.path.join(PIPER, 'espeak-ng.dll')
os.environ['ESPEAK_DATA_PATH'] = PIPER
from phonemizer.backend import EspeakBackend
from phonemizer.separator import Separator

HERE = os.path.dirname(os.path.abspath(__file__))
WORD = re.compile(r'^[a-zåäö]+$')
DBL = re.compile(r'([bdfglmnprst])\1$')       # ends in a doubled consonant (tt, ll, mm, ss, …)
STOP = set(w.strip().lower() for w in io.open(os.path.join(HERE, '..', '..', '..', 'sv-stop.txt'), encoding='utf-8')) \
    if os.path.exists(os.path.join(HERE, '..', '..', '..', 'sv-stop.txt')) else set()
BLOCK = set('sam david frank john tom max jack sex fan skit'.split())

def load_freq(path):
    freq = {}
    for line in io.open(path, encoding='utf-8'):
        p = line.split()
        if len(p) == 2 and WORD.match(p[0]) and 3 <= len(p[0]) <= 6:
            freq[p[0]] = int(p[1])
    return freq

def long_form(s):
    if DBL.search(s):
        return s[:-1]              # vitt -> vit, hall -> hal
    if s.endswith('ck') and len(s) >= 4:
        return s[:-2] + 'k'        # tack -> tak
    return None

def main():
    freq = load_freq(sys.argv[1] if len(sys.argv) > 1 else 'sv_50k.txt')
    words = set(freq)
    be = EspeakBackend('sv')
    sep = Separator(phone='|', word=' ', syllable='')
    def ipa(w):
        return be.phonemize([w], separator=sep, strip=True)[0]

    pairs = []
    for s in words:
        if s in BLOCK or s in STOP:
            continue
        L = long_form(s)
        if not L or L not in words or L in BLOCK:
            continue
        li, si = ipa(L), ipa(s)
        # the contrast we require: LONG form has a long vowel (ː), SHORT form does not
        if 'ː' in li and 'ː' not in si:
            pairs.append((L, s, min(freq[L], freq[s])))
    pairs.sort(key=lambda t: -t[2])
    out = io.open(os.path.join(HERE, 't3_pairs.tsv'), 'w', encoding='utf-8')
    for L, s, f in pairs:
        out.write(f"{L}\t{s}\t{f}\n")
    out.close()
    print(f"pairs={len(pairs)}")

import sys
if __name__ == '__main__':
    main()
