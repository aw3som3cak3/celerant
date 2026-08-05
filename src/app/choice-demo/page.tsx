'use client';

import { useState } from 'react';
import { ChoiceStage, type ChoicePromptData, type ChoiceOption } from '../_components/ChoiceStage';

// THROWAWAY demo of the recognition ChoiceStage (WS II-a). Wired to nothing, no data
// written — it exists only to feel the Fler/Färre and pick-the-amount surface on a real
// tablet, and to confirm the shared client clock ticks on taps just like the numpad and
// letter pad. Delete when the GROUND rungs become graph skills (WS II-b) and render
// through this surface inside /practice for real.

type Demo = { prompt: ChoicePromptData; question: string; options: ChoiceOption[]; answer: string | number };

const ITEMS: Demo[] = [
  {
    prompt: { show: 'structure', kind: 'duck', a: 3, b: 2, structure: 'combine' },
    question: 'Kommer det fler eller färre?',
    options: [{ value: 'combine', render: 'more' }, { value: 'separate', render: 'fewer' }],
    answer: 'combine',
  },
  {
    prompt: { show: 'group', kind: 'apple', a: 4 },
    question: 'Hur många?',
    options: [3, 4, 5, 6].map((n) => ({ value: n, render: 'numeral' as const })),
    answer: 4,
  },
  {
    prompt: { show: 'sum', kind: 'fish', a: 2, b: 3 },
    question: 'Hur många tillsammans?',
    options: [4, 5, 6, 7].map((n) => ({ value: n, render: 'numeral' as const })),
    answer: 5,
  },
  {
    prompt: { show: 'sum', kind: 'star', a: 3, b: 3 },
    question: 'Vilken grupp är lika många?',
    options: [4, 5, 6, 7].map((n) => ({ value: n, render: 'group' as const, kind: 'star' })),
    answer: 6,
  },
];

export default function ChoiceDemo() {
  const [idx, setIdx] = useState(0);
  const [res, setRes] = useState<{ ok: boolean; chosen: string | number; ms: number } | null>(null);
  const it = ITEMS[idx % ITEMS.length];

  return (
    <div className="stage" style={{ textAlign: 'center' }}>
      <p className="muted">ChoiceStage-demo (test, ingen data) — {(idx % ITEMS.length) + 1} / {ITEMS.length}</p>
      {res ? (
        <div className="plain">
          <div style={{ fontSize: '2.5rem' }}>{res.ok ? '✅' : '🤔'}</div>
          <h2>{res.ok ? 'Rätt!' : 'Nästan'}</h2>
          <p className="muted">du valde “{String(res.chosen)}” — rätt var “{String(it.answer)}”</p>
          <p className="muted">tid till val: {res.ms} ms</p>
          <button className="primary" onClick={() => { setRes(null); setIdx((i) => i + 1); }} style={{ marginTop: '1rem' }}>
            Nästa →
          </button>
        </div>
      ) : (
        <ChoiceStage
          itemKey={idx}
          prompt={it.prompt}
          question={it.question}
          options={it.options}
          onCapture={(chosen, ms) => setRes({ ok: chosen === it.answer, chosen, ms })}
        />
      )}
    </div>
  );
}
