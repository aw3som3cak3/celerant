// English on-ramp Phase A audio: single-word en-GB clips for the receptive noun pool (EN_NOUNS in
// src/lib/english-content.ts). First-contact recognition wants a CLEAN single word (not a carrier
// sentence) — the picture carries the meaning. Requires `python -m edge_tts` on PATH.
//   node scripts/spelling-audio/generate-english-nouns.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const VOICE = 'en-GB-SoniaNeural';
const outDir = path.join(repoRoot, 'public', 'audio', 'english');
mkdirSync(outDir, { recursive: true });

// Keep in sync with EN_NOUN_WORDS.
const WORDS = [
  'apple', 'banana', 'tomato', 'pizza', 'rice', 'house', 'fish', 'rose', 'panda', 'koala',
  'elephant', 'giraffe', 'zebra', 'cat', 'dog', 'bird', 'cow', 'duck', 'owl', 'bear',
  'fox', 'sun', 'star', 'car', 'ship', 'key', 'tree', 'gear', 'map', 'bell', 'ladder', 'anchor', 'package',
  // Phase B colours (EN_COLOR_WORDS)
  'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'brown',
  // Phase C action verbs (EN_VERB_WORDS)
  'run', 'jump', 'sit', 'sleep', 'eat', 'stop', 'open', 'look',
  // Phase C -ing forms (EN_VERB_ING_WORDS)
  'running', 'jumping', 'sitting', 'sleeping', 'eating', 'stopping', 'opening', 'looking',
  // Phase B attributes (EN_ATTR_WORDS)
  'big', 'small', 'up', 'down', 'happy', 'sad', 'hot', 'cold',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
const failed = [];
for (let n = 0; n < WORDS.length; n++) {
  const word = WORDS[n];
  const out = path.join(outDir, `${word}.mp3`);
  let done = false;
  for (let attempt = 1; attempt <= 4 && !done; attempt++) {
    try {
      execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, '--text', word, '--write-media', out], { stdio: 'ignore' });
      if (existsSync(out)) { done = true; ok++; }
    } catch {
      await sleep(2500 * attempt);
    }
  }
  if (!done) failed.push(word);
  process.stdout.write(`\r${n + 1}/${WORDS.length} (${ok} ok, ${failed.length} failed)   `);
  await sleep(1800);
}
console.log(`\nGenerated ${ok}/${WORDS.length} English noun clips → ${path.relative(repoRoot, outDir)}`);
if (failed.length) console.log('FAILED (re-run to retry):', failed.join(', '));
