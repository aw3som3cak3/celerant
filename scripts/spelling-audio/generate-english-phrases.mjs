// English on-ramp Phase B/C phrase audio: the two-word recombinations ("big cat") and the SVO frames
// ("the dog is running"). Kept in sync with EN_TWOWORD_PHRASES + EN_FRAME_PHRASES. en-GB Sonia, whole
// phrase (the phrase IS the answer). Filenames carry the phrase verbatim (spaces) — englishAudio
// encodeURIComponent()s the word, so /audio/english/big%20cat.mp3 resolves to "big cat.mp3".
//   node scripts/spelling-audio/generate-english-phrases.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const VOICE = 'en-GB-SoniaNeural';
const outDir = path.join(repoRoot, 'public', 'audio', 'english');
mkdirSync(outDir, { recursive: true });

const TWOWORD_NOUNS = ['cat', 'dog', 'fish', 'star', 'apple', 'house'];
const FRAME_NOUNS = ['dog', 'cat', 'fish', 'bird', 'cow'];
const FRAME_ING = ['running', 'jumping', 'eating', 'sleeping'];
const PHRASES = [
  ...TWOWORD_NOUNS.flatMap((n) => [`big ${n}`, `small ${n}`]),
  ...FRAME_NOUNS.flatMap((n) => FRAME_ING.map((v) => `the ${n} is ${v}`)),
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
const failed = [];
for (let i = 0; i < PHRASES.length; i++) {
  const phrase = PHRASES[i];
  const out = path.join(outDir, `${phrase}.mp3`);
  let done = false;
  for (let attempt = 1; attempt <= 4 && !done; attempt++) {
    try {
      execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, '--text', phrase, '--write-media', out], { stdio: 'ignore' });
      if (existsSync(out)) { done = true; ok++; }
    } catch {
      await sleep(2500 * attempt);
    }
  }
  if (!done) failed.push(phrase);
  process.stdout.write(`\r${i + 1}/${PHRASES.length} (${ok} ok)   `);
  await sleep(1800);
}
console.log(`\nGenerated ${ok}/${PHRASES.length} phrase clips → ${path.relative(repoRoot, outDir)}`);
if (failed.length) console.log('FAILED:', failed.join(' | '));
