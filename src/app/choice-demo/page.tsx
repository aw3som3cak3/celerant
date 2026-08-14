'use client';

import { useState } from 'react';
import { ChoiceStage, type ChoicePromptData, type ChoiceOption } from '../_components/ChoiceStage';
import { TestFamilyGate } from '../_components/TestFamilyGate';

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
    options: [{ value: 'combine', render: 'more', label: 'Fler' }, { value: 'separate', render: 'fewer', label: 'Färre' }],
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
  // English sentence mode — one item of each shape, so the surface can be eyeballed on a tablet
  // without climbing fifteen rungs to reach the tier. Same three ChoiceStage paths the real rungs
  // use: a Swedish meaning + two whole English sentences, a verb-phrase cloze, a one-word cloze.
  {
    prompt: { show: 'sentence', text: 'Idag äter jag ett äpple.', lang: 'sv' },
    question: 'Vilken mening är rätt på engelska?',
    options: [
      { value: 'Today eat I an apple.', render: 'word' as const },
      { value: 'Today I eat an apple.', render: 'word' as const },
    ],
    answer: 'Today I eat an apple.',
  },
  {
    prompt: { show: 'sentence', text: 'Look! The dog ___.', lang: 'en' },
    question: 'Vad passar i luckan?',
    options: [
      { value: 'is running', render: 'word' as const },
      { value: 'runs', render: 'word' as const },
    ],
    answer: 'is running',
  },
  {
    prompt: { show: 'sentence', text: 'My sister is good ___ football.', lang: 'en' },
    question: 'Vilket ord passar i luckan?',
    options: [
      { value: 'on', render: 'word' as const },
      { value: 'at', render: 'word' as const },
    ],
    answer: 'at',
  },
];

export default function Page() { return <TestFamilyGate><ChoiceDemo /></TestFamilyGate>; }
function ChoiceDemo() {
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
