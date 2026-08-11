# Build large, VALIDATED spelling word banks from a Swedish frequency list, so practice can't be
# memorised (the pool is too big) and the holdout genuinely tests generalisation. Two-stage filter:
# cheap string rules first (cut 50k → a few hundred), then espeak-ng G2P confirms phoneme
# transparency (letters == sounds), catching x=/ks/, silent letters, digraphs, etc.
#
#   pip install phonemizer ; python scripts/spelling-audio/build-pool.py <freq.txt>
# Frequency-ordered input → frequency-ordered output (frequent ≈ kid-familiar). Prints candidates
# per tier to scripts/spelling-audio/pool_*.txt for Erik to sample; NOT auto-committed to content.

import os, io, re, sys

PIPER = r'C:\Users\eriko\git\celerant\work-materials\tts\piper'
os.environ['PHONEMIZER_ESPEAK_LIBRARY'] = os.path.join(PIPER, 'espeak-ng.dll')
os.environ['ESPEAK_DATA_PATH'] = PIPER
from phonemizer.backend import EspeakBackend
from phonemizer.separator import Separator

VOWELS = set('aeiouyåäö')
WORD = re.compile(r'^[a-zåäö]+$')
DOUBLE = re.compile(r'([bcdfghjklmnpqrstvwxz])\1')      # doubled consonant → T3, not transparent
DIGRAPH = re.compile(r'sj|stj|skj|tj|kj|dj|hj|lj|ng|gn|j')  # sj/tj/j… one sound, many letters
SOFT = re.compile(r'(sk|k|g)[eiyäö]')                   # soft k/g/sk before a front vowel (tj/sj sound)

def transparent_string(w):  # shared: no doubling, no digraph, no soft k/g/sk
    return not (DOUBLE.search(w) or DIGRAPH.search(w) or SOFT.search(w))

# Subtitle frequency surfaces function words and swearing at the top; strip both so CONTENT words
# (concrete nouns/verbs kids spell) remain. Stopwords come from a file; profanity is a small set.
PROFANITY = set(
    'fan fanken jävla jävlar jävligt skit skiten helvete helvetes kuk fitta hora horor knulla '
    'knullar bajs bajsa piss pissa sex naken snorre balle brudar '
    # death / violence — the subtitle source skews dark; Erik can add any back
    'död döda dödar dödat dödade dör döden mörda mord morden skjut skjuta sköt skott vapen '
    'pistol krig kriget knark droger fylla fyllo galjon lik'.split())

def main():
    freq = sys.argv[1] if len(sys.argv) > 1 else 'sv_50k.txt'
    stop_path = sys.argv[2] if len(sys.argv) > 2 else 'stopwords-sv.txt'
    here = os.path.dirname(os.path.abspath(__file__))
    stop = set(w.strip().lower() for w in io.open(stop_path, encoding='utf-8')) | PROFANITY
    words = []
    for line in io.open(freq, encoding='utf-8'):
        w = line.split()[0].strip().lower()
        if WORD.match(w) and 3 <= len(w) <= 6 and any(c in VOWELS for c in w) and w not in stop:
            words.append(w)
    # de-dup, keep frequency order
    seen = set(); words = [w for w in words if not (w in seen or seen.add(w))]

    # cheap string pre-filter for the two families
    t2_pre = [w for w in words if transparent_string(w) and not re.search(r'[oå]', w)]  # T2 also drops o/å
    recog_pre = [w for w in words if transparent_string(w)]

    be = EspeakBackend('sv')
    sep = Separator(phone='|', word=' ', syllable='')
    cache = {}
    def phon_count(w):
        if w not in cache:
            ipa = be.phonemize([w], separator=sep, strip=True)[0]
            cache[w] = len([p for p in ipa.split('|') if p])
        return cache[w]

    t2 = [w for w in t2_pre if phon_count(w) == len(w)][:400]
    recog = [w for w in recog_pre if phon_count(w) == len(w)][:400]
    single_vowel = [w for w in recog if sum(c in VOWELS for c in w) == 1]

    for name, lst in (('t2', t2), ('recog', recog), ('single_vowel', single_vowel)):
        io.open(os.path.join(here, f'pool_{name}.txt'), 'w', encoding='utf-8').write('\n'.join(lst) + '\n')
        print(f'{name}: {len(lst)}')
    print('DONE')

if __name__ == '__main__':
    main()
