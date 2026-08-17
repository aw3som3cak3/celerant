'use client';

// Eyeball/vet surface for ELECTRONICS slice 1 (test family only — TestFamilyGate). Renders the
// placeholder art and a few sampled items per skill so Erik can sanity-check the assets, the
// misconception distractors, and the arithmetic before real art / a live session. Pure: it samples
// the same generators the practice flow uses (generateCanon), no session or DB.

import { useMemo } from 'react';
import { TestFamilyGate } from '../_components/TestFamilyGate';
import { SKILLS, generateCanon, skillByCode } from '@/skills';
import { skillLabel } from '@/lib/labels';
import { makeRng } from '@/lib/rng';

const ELEC = SKILLS.filter((s) => s.subject === 'electronics');

function Art({ art, size = 76 }: { art: string; size?: number }) {
  return <img src={`/elec/${art}.svg`} alt={art} width={size} height={size} style={{ background: '#fff', borderRadius: 8, padding: 4, border: '1px solid #ddd' }} />;
}

function SkillCard({ code }: { code: string }) {
  const s = skillByCode(code);
  const samples = useMemo(() => Array.from({ length: 3 }, (_, i) => generateCanon(code, makeRng((i * 2654435761 + 101) >>> 0))), [code]);
  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 12, padding: 16, marginBottom: 18 }}>
      <h2 style={{ margin: '0 0 4px' }}>{skillLabel(code)} <code style={{ fontSize: 13, color: '#888' }}>{code}</code></h2>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#666' }}>
        {s.format === 'choice' ? 'igenkänning/modell · noggrannhet (ingen klocka)' : 'beräkning · flyt (numpad)'}
        {' · '}kräver: [{s.requires.join(', ') || '—'}]{' · '}korsberoende: [{(s.crossRequires ?? []).join(', ')}]
      </p>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {samples.map((it, i) => (
          <div key={i} style={{ minWidth: 220 }}>
            {it.choice ? (
              <>
                {it.choice.prompt.show === 'elec' && it.choice.prompt.art ? <div style={{ marginBottom: 6 }}><Art art={it.choice.prompt.art} /></div> : null}
                <p style={{ fontWeight: 600, margin: '0 0 6px' }}>{it.choice.question}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {it.choice.options.map((o, k) => {
                    const correct = String(o.value) === it.answer;
                    return 'art' in o ? (
                      <div key={k} style={{ textAlign: 'center', outline: correct ? '3px solid #2e7d32' : 'none', borderRadius: 10 }}>
                        <Art art={(o as { art: string }).art} size={60} />
                        <div style={{ fontSize: 11, color: correct ? '#2e7d32' : '#999' }}>{correct ? '✓ rätt' : String(o.value)}</div>
                      </div>
                    ) : (
                      <span key={k} style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: 6 }}>{String(o.value)}</span>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <p style={{ fontFamily: 'monospace', fontSize: 18, margin: '0 0 4px' }}>{it.prompt}</p>
                <p style={{ margin: '0 0 4px' }}>svar: <b>{it.answer}</b></p>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#666' }}>{it.steps.map((st, k) => <li key={k}>{st}</li>)}</ol>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ElektronikDemo() {
  return (
    <TestFamilyGate>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: 20 }}>
        <h1>Elektronik — slice 1 (Tänd en lysdiod)</h1>
        <p style={{ color: '#666' }}>
          Granska-yta för den fjärde ämnet. Bilderna är PLATSHÅLLARE (enkla SVG) och behöver riktig konst.
          Modell-distraktorerna ÄR de dokumenterade missuppfattningarna (en-tråd, ström förbrukas, krockande ström).
        </p>
        {ELEC.map((s) => <SkillCard key={s.code} code={s.code} />)}
      </div>
    </TestFamilyGate>
  );
}
