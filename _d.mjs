import Database from 'better-sqlite3';
const db = new Database(process.argv[2], { readonly: true });
const dog = db.prepare("SELECT id FROM player WHERE icon='dog'").get().id;
const START = Date.UTC(2026,7,7,22,0);
const rows = db.prepare(`SELECT skill_code, item_json, given, correct, tries, dont_know, latency_ms FROM attempt WHERE player_id=? AND at>=? AND skill_code LIKE 'ground_%' OR (player_id=? AND at>=? AND skill_code='count_within_10') ORDER BY at`).all(dog,START,dog,START);
for (const r of rows){
  let it; try { it = JSON.parse(r.item_json); } catch { it = {}; }
  const ans = it.answer ?? it.prompt ?? '?';
  const choice = it.choice ? JSON.stringify(it.choice).slice(0,120) : '';
  console.log(`${r.skill_code.padEnd(16)} given=${String(r.given).padEnd(10)} correct=${r.correct} tries=${r.tries} idk=${r.dont_know} lat=${r.latency_ms}ms`);
  console.log(`   item: prompt="${it.prompt??''}" answer=${JSON.stringify(it.answer)} ${choice? 'choice='+choice : ''}`);
}
