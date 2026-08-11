// Generate the English morphographic audio from english-sentences.json — the reproducible source
// of every clip's spoken text. Each word is delivered the way real dictation works:
// "word. A sentence with the word. word." (word, carrier sentence, word) — so short words (won,
// met, put) are unambiguous even when clearly pronounced. Downstream nothing parses the sentence;
// it is audio-only disambiguation.
//
// Requires edge-tts on PATH (pip install edge-tts). Run from the repo root:
//   node scripts/spelling-audio/generate-english.mjs
// Paced with backoff — edge-tts rate-limits bursts, so a naive loop loses most clips.

import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const VOICE = 'en-GB-SoniaNeural'; // clear British English; matches the en-GB TTS lang the app used
const outDir = path.join(repoRoot, 'public', 'audio', 'english');
mkdirSync(outDir, { recursive: true });

const sentences = JSON.parse(readFileSync(path.join(here, 'english-sentences.json'), 'utf8'));
const words = Object.keys(sentences);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
let ok = 0;
const failed = [];
for (const word of words) {
  n++;
  const text = `${word}. ${sentences[word]} ${word}.`;
  const out = path.join(outDir, `${word}.mp3`);
  let done = false;
  for (let attempt = 1; attempt <= 4 && !done; attempt++) {
    try {
      execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, '--text', text, '--write-media', out], { stdio: 'ignore' });
      if (existsSync(out)) { done = true; ok++; }
    } catch {
      await sleep(2500 * attempt); // backoff on a rate-limit
    }
  }
  if (!done) failed.push(word);
  process.stdout.write(`\r${n}/${words.length} (${ok} ok, ${failed.length} failed)   `);
  await sleep(2200); // pace between clips
}
console.log(`\nGenerated ${ok}/${words.length} English clips → ${path.relative(repoRoot, outDir)}`);
if (failed.length) console.log('FAILED (re-run to retry):', failed.join(', '));
