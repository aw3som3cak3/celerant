'use client';

import { useMemo, useState } from 'react';
import { ModelStage } from '../_components/ModelStage';
import { pizzaProblem, type Openness } from '@/lib/modelling';
import { makeRng, randomSeed } from '@/lib/rng';
import { TestFamilyGate } from '../_components/TestFamilyGate';

// THROWAWAY demo of the APPLICATION-tier ModelStage (modelling first slice). Wired to nothing, no
// data written — it exists only to feel the pizza-party modelling loop end to end on a real tablet
// at the three openness levels, exactly as /choice-demo did for the recognition surface. It does
// NOT touch the selector, θ, the fluency gate or the ledger; modelling is deliberately none of
// those. Promotion into /practice is a later, reported step (needs the reading gate and a
// SEPARATE, non-arithmetic tracking decision — see the handoff report), not this page.

const LEVELS: { openness: Openness; blurb: string }[] = [
  { openness: 1, blurb: 'Talen är givna — välj bara räknesätt.' },
  { openness: 2, blurb: 'Ett tal hör inte hit — hoppa över det.' },
  { openness: 3, blurb: 'Räkna gästerna själv och bestäm hur mycket de äter.' },
];

export default function Page() { return <TestFamilyGate><ModelDemo /></TestFamilyGate>; }
function ModelDemo() {
  const [idx, setIdx] = useState(0);
  const [seed, setSeed] = useState(() => randomSeed());
  const level = LEVELS[idx % LEVELS.length];
  const problem = useMemo(() => pizzaProblem(makeRng(seed), level.openness), [seed, level.openness]);

  const next = () => { setIdx((i) => i + 1); setSeed(randomSeed()); };

  return (
    <div className="stage" style={{ justifyContent: 'flex-start', paddingTop: '1.5rem' }}>
      <p className="muted" style={{ textAlign: 'center' }}>
        ModelStage-demo (test, ingen data) — öppenhet {level.openness} / 3
      </p>
      <p className="muted" style={{ textAlign: 'center', maxWidth: 460 }}>{level.blurb}</p>
      <ModelStage key={`${seed}-${level.openness}`} problem={problem} onDone={next} />
      <button className="softbtn" style={{ marginTop: '1.5rem' }} onClick={next}>
        Nästa situation →
      </button>
    </div>
  );
}
