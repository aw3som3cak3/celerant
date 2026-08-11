// Regenerate the RECOGNITION spelling audio from recog-sentences.json, in the same carrier format
// as T2/T3: "word. <sentence>. word." (Sofie, sv-SE). The recognition clips (t0…t1c) are the
// SHORTEST, most-ambiguous words (sol, mus, ko, is), so the carrier sentence matters most here.
// NOTE for review: these clips are shared across the recognition sub-tiers, including the
// SEGMENTATION rungs (hur många ljud / vilken vokal) — the isolated bookend word is the target
// there; vet in granska whether the middle sentence distracts on those two. If it does, those
// tiers need isolated clips (a follow-up), not this shared carrier clip.
//
// Requires edge-tts on PATH. Run from the repo root:
//   node scripts/spelling-audio/generate-recog.mjs
// Paced with backoff — edge-tts rate-limits bursts.

import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const VOICE = 'sv-SE-SofieNeural';
const outDir = path.join(repoRoot, 'public', 'audio', 'spelling', 'recog');
mkdirSync(outDir, { recursive: true });

const sentences = JSON.parse(readFileSync(path.join(here, 'recog-sentences.json'), 'utf8'));
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
      await sleep(2500 * attempt);
    }
  }
  if (!done) failed.push(word);
  process.stdout.write(`\r${n}/${words.length} (${ok} ok, ${failed.length} failed)   `);
  await sleep(2200);
}
console.log(`\nGenerated ${ok}/${words.length} recognition clips → ${path.relative(repoRoot, outDir)}`);
if (failed.length) console.log('FAILED (re-run to retry):', failed.join(', '));
