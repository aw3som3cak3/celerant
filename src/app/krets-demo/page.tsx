'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { TestFamilyGate } from '../_components/TestFamilyGate';
import { CIRCUIT_GOALS } from '@/lib/circuit';

// THROWAWAY demo of the COMPOSITION-tier CircuitStage ("Bygg en krets", §7). Wired to nothing, no
// data written — it exists only to FEEL the snap-together loop end to end on a real tablet, across
// the three puzzles (combine to 320 Ω · close the loop · flip the LED). It does NOT touch the
// selector, θ, the ledger; composition is deliberately none of those.
//
// NO FLUENCY GATE HERE, on purpose: this is a vet/mechanic demo, and no test child has ever practised
// electronics (the subject isn't in their rotation yet), so a `met`-gate would lock every puzzle and
// leave nothing to try. The real fluency gate belongs to the eventual in-rotation surface, not here.
//
// CLIENT-ONLY: CircuitStage renders @wokwi/elements (LitElement custom elements) that cannot run on
// the server, so it is imported ssr:false and registers the elements on mount.

const CircuitStage = dynamic(() => import('../_components/CircuitStage').then((m) => m.CircuitStage), {
  ssr: false,
  loading: () => <div className="stage"><p className="muted">Laddar delar…</p></div>,
});

export default function Page() {
  return (
    <TestFamilyGate>
      <KretsDemo />
    </TestFamilyGate>
  );
}

function KretsDemo() {
  const [gi, setGi] = useState(0);
  const goal = CIRCUIT_GOALS[gi % CIRCUIT_GOALS.length];
  const next = () => setGi((g) => (g + 1) % CIRCUIT_GOALS.length);

  return (
    <div className="stage" style={{ justifyContent: 'flex-start', paddingTop: '1.5rem' }}>
      <p className="muted" style={{ textAlign: 'center' }}>
        CircuitStage-demo (test, ingen data) — {gi + 1}/{CIRCUIT_GOALS.length}
      </p>

      <CircuitStage key={goal.id} goal={goal} onDone={next} />

      <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.5rem' }}>
        <button className="softbtn" onClick={next}>Nästa bygge →</button>
      </div>
    </div>
  );
}
