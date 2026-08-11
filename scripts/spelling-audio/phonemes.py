# Machine-authoritative Swedish phoneme counts (grapheme→phoneme via espeak-ng), so the
# TRANSPARENT_WORDS `sounds` values in src/lib/spelling-content.ts rest on a reproducible G2P,
# not hand-counting. A word belongs in the transparent (segmentation/tiles) pool only when its
# phoneme count equals its letter count AND it has a single vowel — this script exposes both.
#
# Setup: pip install phonemizer  (espeak-ng.dll + espeak-ng-data ship with Piper, in
# work-materials/tts/piper/). Run:  python scripts/spelling-audio/phonemes.py <ord> <ord> …
# (no args → the current transparent pool). Prints  word  IPA  phoneme-count.

import os, io, sys

PIPER = r'C:\Users\eriko\git\celerant\work-materials\tts\piper'
os.environ['PHONEMIZER_ESPEAK_LIBRARY'] = os.path.join(PIPER, 'espeak-ng.dll')
os.environ['ESPEAK_DATA_PATH'] = PIPER

from phonemizer.backend import EspeakBackend
from phonemizer.separator import Separator

DEFAULT = ['sol', 'mus', 'bil', 'hus', 'ris', 'ros', 'val', 'tåg', 'båt', 'ko',
           'räv', 'våg', 'hund', 'häst', 'fisk']

def main():
    words = sys.argv[1:] or DEFAULT
    be = EspeakBackend('sv')
    sep = Separator(phone='|', word=' ', syllable='')
    w = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')  # console may be cp1252; force utf-8
    for word in words:
        ipa = be.phonemize([word], separator=sep, strip=True)[0]
        phones = [p for p in ipa.split('|') if p]
        w.write(f"{word}\t{ipa}\t{len(phones)}\n")
    w.flush()

if __name__ == '__main__':
    main()
