import Database from 'better-sqlite3';
const db = new Database(process.argv[2], { readonly: true });
const day = ms => new Date(ms).toISOString().slice(0,10);
const hm = ms => new Date(ms).toISOString().slice(11,16);
const med = a => { if(!a.length) return 0; const s=[...a].sort((x,y)=>x-y); const m=s.length>>1; return Math.round(s.length%2?s[m]:(s[m-1]+s[m])/2); };
// health: tables exist?
const tbls = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
console.log('player_target table:', tbls.includes('player_target') ? 'OK' : 'MISSING');
console.log('shadow_fluency rows (all):', db.prepare('SELECT COUNT(*) c FROM shadow_fluency').get().c);
const maxAt = db.prepare('SELECT MAX(at) m FROM attempt').get().m;
console.log('latest attempt:', new Date(maxAt).toISOString());
// window: 2026-08-08 Stockholm (UTC+2) → from 2026-08-07 22:00 UTC
const START = Date.UTC(2026,7,7,22,0);
const REAL = db.prepare("SELECT p.id,p.icon,p.school_year FROM player p JOIN family f ON f.id=p.family_id WHERE f.icon_pair='ice_cream+turtle'").all();
const ids = REAL.map(p=>p.id);
const tot = db.prepare(`SELECT COUNT(*) c FROM attempt WHERE at>=? AND player_id IN (${ids.map(()=>'?').join(',')})`).get(START,...ids).c;
console.log(`\n=== TODAY (2026-08-08 Sthlm) — real family: ${tot} attempts ===`);
for (const p of REAL){
  const at = db.prepare(`SELECT at,skill_code,correct,tries,dont_know,latency_ms,warmup,voided_at,session_run_id FROM attempt WHERE player_id=? AND at>=? ORDER BY at`).all(p.id,START);
  if(!at.length){ console.log(`\n### ${p.icon} (åk${p.school_year}) — no activity today`); continue; }
  const g = at.filter(a=>!a.warmup&&!a.voided_at);
  const ft = g.filter(a=>a.tries<=1);
  const fc = ft.filter(a=>a.correct===1&&!a.dont_know);
  const idk = g.filter(a=>a.dont_know===1);
  const sess = new Set(at.map(a=>a.session_run_id).filter(Boolean)).size;
  const lat = g.filter(a=>a.correct===1&&!a.dont_know&&a.latency_ms>=300&&a.latency_ms<=30000).map(a=>a.latency_ms);
  console.log(`\n### ${p.icon} (åk${p.school_year}) — ${hm(at[0].at)}-${hm(at.at(-1).at)}  ${at.length} att, ${sess} sess`);
  console.log(`  first-try acc: ${ft.length?Math.round(100*fc.length/ft.length):'-'}%  idk: ${g.length?Math.round(100*idk.length/g.length):'-'}%  med latency: ${med(lat)}ms`);
  const sk = {}; for(const a of g){ (sk[a.skill_code]??=[]).push(a); }
  const top = Object.entries(sk).sort((x,y)=>y[1].length-x[1].length)
    .map(([k,v])=>{const f=v.filter(a=>a.tries<=1);const c=f.filter(a=>a.correct===1&&!a.dont_know);return `${k}(${v.length},${f.length?Math.round(100*c.length/f.length):0}%)`;});
  console.log(`  skills: ${top.join(' ')}`);
}
