'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { getJSON } from '@/lib/client';
import { TestFamilyGate } from '../_components/TestFamilyGate';
import { CIRCUIT_GOALS } from '@/lib/circuit';

// THROWAWAY demo of the COMPOSITION-tier CircuitStage ("Bygg en krets", §7). Wired to nothing, no
// data written — it exists only to feel the snap-together loop end to end on a real tablet, across
// the three puzzles (combine to 320 Ω · close the loop · flip the LED). It does NOT touch the
// selector, θ, the fluency gate or the ledger; composition is deliberately none of those.
//
// CLIENT-ONLY: CircuitStage renders @wokwi/elements (LitElement custom elements) that cannot run on
// the server, so it is imported with ssr:false and registers the elements on mount.
//
// GATING (light, fail-open to "locked"): the surface is TEST-FAMILY gated (TestFamilyGate) like the
// other demos, and each puzzle additionally reads the fluency signal's `met` for the skill it SPENDS
// — reusing the existing /api/electronics endpoint (which already reports per-skill `met` for the
// build ladder). A puzzle whose skill isn't met shows a soft "öva klart först" card instead of the
// stage; any fetch failure degrades to locked, never a crash.

const CircuitStage = dynamic(() => import('../_components/CircuitStage').then((m) => m.CircuitStage), {
  ssr: false,
  loading: () => <div className="stage"><p className="muted">Laddar delar…</p></div>,
});

type LadderSkill = { code: string; met: boolean };
type Player = { id: string; icon: string; schoolYear: number; ladder: { skills: LadderSkill[] }[] };
type ElecData = { authorized: boolean; players: Player[] };

export default function Page() {
  return (
    <TestFamilyGate>
      <KretsDemo />
    </TestFamilyGate>
  );
}

function KretsDemo() {
  const [gi, setGi] = useState(0);
  const [data, setData] = useState<ElecData | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getJSON<ElecData>('/api/electronics')
      .then((d) => { setData(d); setSel((c) => c ?? d.players[0]?.id ?? null); })
      .catch(() => setFailed(true)); // fail-open to locked, never crash
  }, []);

  const goal = CIRCUIT_GOALS[gi % CIRCUIT_GOALS.length];
  const next = () => setGi((g) => (g + 1) % CIRCUIT_GOALS.length);

  // The met-set for the selected child (one child at a time — private, not comparative). Union of the
  // per-skill `met` flags the ladder already carries.
  const player = data?.players.find((p) => p.id === sel) ?? data?.players[0];
  const metCodes = useMemo(() => {
    const s = new Set<string>();
    for (const row of player?.ladder ?? []) for (const sk of row.skills) if (sk.met) s.add(sk.code);
    return s;
  }, [player]);

  const unlocked = metCodes.has(goal.spends);

  return (
    <div className="stage" style={{ justifyContent: 'flex-start', paddingTop: '1.5rem' }}>
      <p className="muted" style={{ textAlign: 'center' }}>
        CircuitStage-demo (test, ingen data) — {goal.title}
      </p>

      {/* One child at a time. */}
      {data && data.players.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {data.players.map((p) => (
            <button key={p.id} className={`pill-btn ${p.id === player?.id ? 'accent' : ''}`} onClick={() => setSel(p.id)}>
              åk {p.schoolYear}
            </button>
          ))}
        </div>
      )}

      {failed || !data ? (
        !data && !failed ? (
          <p className="muted">…</p>
        ) : (
          <p className="muted" style={{ maxWidth: 460, textAlign: 'center' }}>Kunde inte läsa färdigheter — låst.</p>
        )
      ) : unlocked ? (
        <CircuitStage key={`${goal.id}-${player?.id}`} goal={goal} onDone={next} />
      ) : (
        <div className="krets-locked">
          <p className="krets-title">{goal.title}</p>
          <p className="krets-hint">Låst — öva klart <code>{goal.spends}</code> först, så öppnas bygget.</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.5rem' }}>
        <button className="softbtn" onClick={next}>Nästa bygge →</button>
      </div>
    </div>
  );
}
