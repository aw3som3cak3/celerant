'use client';

// Diagnostic lens for BROKEN generated/randomised questions (test family only). Every wrong answer
// or "vet inte" is logged with the question rebuilt from its seed; this page aggregates them by
// (skill, correct answer) so an item that's failed or idk'd repeatedly — the tell-tale of a bad
// clip, an ambiguous prompt, or a wrong key — floats to the top. Pure review; nothing is written.

import { useEffect, useMemo, useState } from 'react';
import { getJSON } from '@/lib/client';

type Row = {
  id: number; icon: string; skill_code: string; subject: string | null; seed: number | null;
  prompt: string | null; answer: string | null; given: string | null; dont_know: number; detail: string | null; at: number;
};
type Group = { skill: string; subject: string | null; answer: string; total: number; fel: number; idk: number; kids: Set<string>; examples: Row[] };

export default function FragorPage() {
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');
  const [rows, setRows] = useState<Row[]>([]);
  const [subj, setSubj] = useState<'alla' | 'maths' | 'spelling' | 'english'>('alla');
  const [onlyRepeated, setOnlyRepeated] = useState(false);

  useEffect(() => {
    getJSON<{ authorized?: boolean; rows?: Row[] }>('/api/stava/questions')
      .then((r) => {
        if (!r?.authorized) return setState('denied');
        setRows(r.rows ?? []);
        setState('ok');
      })
      .catch(() => setState('denied'));
  }, []);

  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const r of rows) {
      if (subj !== 'alla' && r.subject !== subj) continue;
      const key = `${r.skill_code}|${r.answer ?? ''}`;
      let g = m.get(key);
      if (!g) { g = { skill: r.skill_code, subject: r.subject, answer: r.answer ?? '', total: 0, fel: 0, idk: 0, kids: new Set(), examples: [] }; m.set(key, g); }
      g.total++;
      if (r.dont_know) g.idk++; else g.fel++;
      g.kids.add(r.icon);
      if (g.examples.length < 5) g.examples.push(r);
    }
    let out = [...m.values()];
    if (onlyRepeated) out = out.filter((g) => g.total >= 2);
    return out.sort((a, b) => b.total - a.total || b.idk - a.idk);
  }, [rows, subj, onlyRepeated]);

  if (state === 'loading') return <div className="granska"><p>Laddar…</p></div>;
  if (state === 'denied')
    return (
      <div className="granska">
        <h1>Trasiga frågor</h1>
        <p>Den här sidan är bara tillgänglig för testfamiljen.</p>
      </div>
    );

  return (
    <div className="granska">
      <h1>Frågor att granska</h1>
      <p className="granska-hint">
        Varje fel svar och «vet inte» loggas med frågan återskapad från sitt seed. Grupperat per
        (färdighet + rätt svar) — det som missas eller idk:as <em>upprepat</em> (särskilt av flera
        barn) är den vanligaste signalen på en trasig fråga: felhört ljud, otydlig prompt eller fel
        facit. <a href="/stava/granska">→ Granska ljud</a>
      </p>

      <div className="granska-filter">
        {(['alla', 'maths', 'spelling', 'english'] as const).map((s) => (
          <button key={s} type="button" className={`granska-tab ${subj === s ? 'on' : ''}`} onClick={() => setSubj(s)}>
            {s === 'alla' ? 'Alla ämnen' : s === 'maths' ? 'Matte' : s === 'spelling' ? 'Stavning' : 'Engelska'}
          </button>
        ))}
        <button type="button" className={`granska-tab ${onlyRepeated ? 'on' : ''}`} onClick={() => setOnlyRepeated((v) => !v)}>
          Bara upprepade (≥2)
        </button>
      </div>

      <div className="granska-stats">
        <span><strong>{groups.length}</strong> unika frågor</span>
        <span>{rows.length} fel/idk totalt</span>
      </div>

      {groups.length === 0 ? (
        <p className="granska-hint">Inget loggat än. 🎉</p>
      ) : (
        <div className="fragor-list">
          {groups.map((g) => (
            <div key={`${g.skill}|${g.answer}`} className="fragor-row">
              <div className="fragor-head">
                <span className="fragor-answer">{g.answer || '—'}</span>
                <span className="fragor-skill">{g.skill}{g.subject ? ` · ${g.subject}` : ''}</span>
                <span className="fragor-counts">
                  {g.idk > 0 && <span className="fragor-idk">vet-inte ×{g.idk}</span>}
                  {g.fel > 0 && <span className="fragor-fel">fel ×{g.fel}</span>}
                  <span className="fragor-kids">{g.kids.size} barn</span>
                </span>
              </div>
              <div className="fragor-ex">
                {g.examples.map((e) => (
                  <span key={e.id} className="fragor-chip">
                    {e.icon}: {e.dont_know ? '«vet inte»' : `«${e.given ?? ''}»`}
                    {!e.dont_know && g.answer && e.given !== g.answer ? ` → rätt: ${g.answer}` : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
