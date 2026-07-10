import { ICONS, BY_KEY, PAIR_COUNT, search, familyKey, CATEGORIES } from "./icons.ts";
let bad = 0; const fail = (m:string)=>{bad++;console.log("  ✗",m);};

if (BY_KEY.size !== ICONS.length) fail("duplicate key");
const glyphs = new Set(ICONS.map(i=>i.glyph));
if (glyphs.size !== ICONS.length) fail("duplicate glyph");
for (const i of ICONS) {
  if (!/^[a-z0-9_]+$/.test(i.key)) fail(`bad key ${i.key}`);
  if (i.keywords.length < 1) fail(`${i.key}: no keywords`);
  if (!CATEGORIES.includes(i.category)) fail(`${i.key}: unknown category`);
}
// forbidden ranges: human faces/people, flags, religion
for (const i of ICONS) {
  const cp = [...i.glyph].map(c=>c.codePointAt(0)!);
  if (cp.some(c => (c>=0x1F600&&c<=0x1F64F) || (c>=0x1F466&&c<=0x1F487) || (c>=0x1F1E6&&c<=0x1F1FF) || (c>=0x1F3FB&&c<=0x1F3FF)))
    fail(`${i.key}: forbidden codepoint range (face/person/flag/skin-tone)`);
}
// search sanity
if (search("hotdog").length === 0 && search("varmkorv").length === 0) fail("hotdog unfindable");
if (search("kott").length === 0) fail("diacritic folding broken (kott → kött)");
if (!search("korv").some(i=>i.key==="hotdog")) fail("keyword search broken");
try { familyKey("fox","fox"); fail("allowed identical pair"); } catch {}
if (familyKey("hotdog","fox") !== familyKey("fox","hotdog")) fail("pair not canonical");

const byCat = new Map<string,number>();
for (const i of ICONS) byCat.set(i.category,(byCat.get(i.category)??0)+1);
console.log(`\n${ICONS.length} icons · ${PAIR_COUNT.toLocaleString("sv-SE")} möjliga familjer`);
console.log([...byCat].map(([c,n])=>`${c} ${n}`).join(" · "));
console.log(bad===0 ? "\nall icon properties hold\n" : `\n${bad} failure(s)\n`);
process.exit(bad?1:0);
