// Fetch ARASAAC pictograms (https://arasaac.org, CC BY-NC-SA, author Sergio Palao) for the English
// on-ramp verb + attribute set, replacing the hand-drawn SVGs. Picks the best exact-keyword match,
// downloads the coloured 500px PNG into public/pictos/<word>.png, and prints the word→id map (kept in
// public/pictos/ARASAAC-CREDITS.txt for attribution). Run: node scripts/fetch-arasaac.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'public', 'pictos');
mkdirSync(outDir, { recursive: true });

// word → search term (override where the plain word ranks poorly).
const WORDS = {
  run: 'run', jump: 'jump', sit: 'sit down', sleep: 'sleep', eat: 'eat', stop: 'stop',
  open: 'open', look: 'look', big: 'big', small: 'small', up: 'up', down: 'down',
  happy: 'happy', sad: 'sad', hot: 'hot', cold: 'cold',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const creds = [];
for (const [word, term] of Object.entries(WORDS)) {
  try {
    const res = await fetch(`https://api.arasaac.org/api/pictograms/en/search/${encodeURIComponent(term)}`);
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) { console.log(`${word}: NO RESULT`); continue; }
    // prefer a result whose keywords contain the exact word; else the top result.
    const exact = list.find((p) => (p.keywords || []).some((k) => (k.keyword || '').toLowerCase() === word));
    const pick = exact || list[0];
    const id = pick._id;
    const png = await (await fetch(`https://static.arasaac.org/pictograms/${id}/${id}_500.png`)).arrayBuffer();
    writeFileSync(path.join(outDir, `${word}.png`), Buffer.from(png));
    creds.push(`${word.padEnd(7)} ${id}  (${(pick.keywords || []).map((k) => k.keyword).join(', ')})`);
    console.log(`${word.padEnd(7)} → id ${id} (${Math.round(png.byteLength / 1024)}kB)`);
  } catch (e) {
    console.log(`${word}: ERROR ${e.message}`);
  }
  await sleep(400);
}
writeFileSync(
  path.join(outDir, 'ARASAAC-CREDITS.txt'),
  'English on-ramp pictograms are from ARASAAC (https://arasaac.org), author Sergio Palao,\n' +
  'licensed CC BY-NC-SA 4.0. Property of the Government of Aragón (Spain). word → pictogram id:\n\n' +
  creds.join('\n') + '\n',
);
console.log('\nWrote public/pictos/ARASAAC-CREDITS.txt');
