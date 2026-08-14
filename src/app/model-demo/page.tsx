'use client';

import { useMemo, useState } from 'react';
import { ModelStage } from '../_components/ModelStage';
import { SCENARIOS, type Openness } from '@/lib/modelling';
import { makeRng, randomSeed } from '@/lib/rng';
import { TestFamilyGate } from '../_components/TestFamilyGate';

// THROWAWAY demo of the APPLICATION-tier ModelStage. Wired to nothing, no data written — it exists
// only to feel the modelling loop end to end on a real tablet, across THREE scenarios with
// genuinely different mathematical structures (pizza × then ÷; fair share ÷ with a remainder;
// budget + then −) at the three openness levels. It does NOT touch the selector, θ, the fluency
// gate or the ledger; modelling is deliberately none of those. Test-family gated.

const OPENNESS: { openness: Openness; blurb: string }[] = [
  { openness: 1, blurb: 'Talen är givna — välj bara räknesätt.' },
  { openness: 2, blurb: 'Ett tal hör inte hit — hoppa över det.' },
  { openness: 3, blurb: 'Räkna eller bestäm ett tal själv först.' },
];

export default function Page() { return <TestFamilyGate><ModelDemo /></TestFamilyGate>; }
function ModelDemo() {
  const [sc, setSc] = useState(0);
  const [op, setOp] = useState(0);
  const [seed, setSeed] = useState(() => randomSeed());
  const scenario = SCENARIOS[sc % SCENARIOS.length];
  const level = OPENNESS[op % OPENNESS.length];
  const problem = useMemo(() => scenario.build(makeRng(seed), level.openness), [scenario, seed, level.openness]);

  // Advance across the grid: openness 1→2→3, then the next scenario, a fresh situation each time.
  const next = () => {
    setSeed(randomSeed());
    if ((op + 1) % OPENNESS.length === 0) setSc((s) => s + 1);
    setOp((o) => o + 1);
  };

  return (
    <div className="stage" style={{ justifyContent: 'flex-start', paddingTop: '1.5rem' }}>
      <p className="muted" style={{ textAlign: 'center' }}>
        ModelStage-demo (test, ingen data) — {scenario.label} · öppenhet {level.openness} / 3
      </p>
      <p className="muted" style={{ textAlign: 'center', maxWidth: 460 }}>{level.blurb}</p>
      <ModelStage key={`${scenario.id}-${seed}-${level.openness}`} problem={problem} onDone={next} />
      <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.5rem' }}>
        <button className="softbtn" onClick={next}>Nästa öppenhet →</button>
        <button className="softbtn" onClick={() => { setSc((s) => s + 1); setOp(0); setSeed(randomSeed()); }}>Byt situation ↻</button>
      </div>
    </div>
  );
}
