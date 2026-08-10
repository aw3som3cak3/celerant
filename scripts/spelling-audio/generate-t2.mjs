// Regenerate the T2 spelling audio from sentences.json — the reproducible source of every
// clip's spoken text. Each word is delivered the way real dictation works: "Ordet. En mening
// med ordet. Ordet." (word, carrier sentence, word) — this makes short words (ny, by) audible
// and disambiguates meaning without revealing the spelling. The ANSWER is still just the word;
// the sentence is audio-only enrichment (nothing downstream parses it).
//
// Requires edge-tts on PATH (pip install edge-tts). Run from the repo root:
//   node scripts/spelling-audio/generate-t2.mjs
// Edit a sentence in sentences.json and re-run to regenerate just by re-running (idempotent).

import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const VOICE = 'sv-SE-SofieNeural';
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const outDir = path.join(repoRoot, 'public', 'audio', 'spelling', 't2');
mkdirSync(outDir, { recursive: true });

const sentences = JSON.parse(readFileSync(path.join(here, 'sentences.json'), 'utf8'));
const words = Object.keys(sentences);

let n = 0;
for (const word of words) {
  const text = `${word}. ${sentences[word]} ${word}.`;
  const out = path.join(outDir, `${word}.mp3`);
  execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, '--text', text, '--write-media', out], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  n += 1;
  process.stdout.write(`  ${word}\n`);
}
console.log(`\nGenerated ${n} T2 clips → ${path.relative(repoRoot, outDir)}`);
