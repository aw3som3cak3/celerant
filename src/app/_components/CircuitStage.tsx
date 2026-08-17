'use client';

import { useState } from 'react';
import {
  type CircuitGoal,
  type Circuit,
  type Judgement,
  validate,
  partById,
} from '@/lib/circuit';
import { WokwiResistor, WokwiLed } from './WokwiPart';

// CircuitStage — the COMPOSITION surface for "Bygg en krets" (docs/electronics-subject-plan.md §7).
// The screen-side mirror of the physical build: the child SNAPS real parts into a single series loop
// and the scene tells her whether the lamp lights. A NEW surface (like ModelStage), reusing the
// picture-book scene vocabulary. It writes NOTHING — no θ, no attempt, no ledger; validate() is a
// pure rule check over the assembled loop, never a simulation.
//
// SNAP-TOGETHER, dead simple, one gesture per puzzle (goal.interaction):
//   combine — tap two resistors so their REAL colour bands add up to the target (elec_series_add)
//   close   — tap the open gap to snap the ring shut so the lamp lights (elec_loop)
//   flip    — tap the LED to turn it the right way round (elec_polarity)
//
// GUARDRAILS: witness, don't reward — "✓ Kretsen är hel, lampan lyser", no points/streaks/badges. A
// miss SOFTENS and re-serves (no red X): the child just tries another snap.

const battId = (goal: CircuitGoal) => goal.tray.find((p) => p.kind === 'battery')?.id ?? 'batt';
const ledId = (goal: CircuitGoal) => goal.tray.find((p) => p.kind === 'led')?.id ?? 'led';

// Build the child's current loop from the per-puzzle UI state.
function buildCircuit(goal: CircuitGoal, ui: UiState): Circuit {
  if (goal.interaction === 'combine') {
    return { placed: [battId(goal), ...ui.picks, ledId(goal)], ledForward: true, closed: true };
  }
  if (goal.interaction === 'close') {
    return { ...goal.solution, closed: ui.closed };
  }
  return { ...goal.solution, ledForward: ui.forward };
}

type UiState = { picks: string[]; closed: boolean; forward: boolean };

function initialUi(goal: CircuitGoal): UiState {
  return {
    picks: [],
    closed: goal.interaction === 'close' ? false : true, // the close puzzle starts with an open ring
    forward: goal.interaction === 'flip' ? false : true, // the flip puzzle starts reversed
  };
}

export function CircuitStage({ goal, onDone }: { goal: CircuitGoal; onDone?: () => void }) {
  const [ui, setUi] = useState<UiState>(() => initialUi(goal));
  const [result, setResult] = useState<Judgement | null>(null);

  const circuit = buildCircuit(goal, ui);
  const lit = result?.ok ?? false;
  const resistors = goal.tray.filter((p) => p.kind === 'resistor');
  const combineReady = ui.picks.length === 2;

  const check = (next: UiState) => setResult(validate(goal, buildCircuit(goal, next)));

  // combine: tap a tray resistor to pick it (max 2); tap a picked one to drop it. A miss re-serves —
  // the child just re-picks; we clear the verdict so nothing lingers as a "wrong" mark.
  const togglePick = (id: string) => {
    setResult(null);
    setUi((s) => {
      const has = s.picks.includes(id);
      const picks = has ? s.picks.filter((x) => x !== id) : s.picks.length < 2 ? [...s.picks, id] : s.picks;
      return { ...s, picks };
    });
  };
  const snapClosed = () => setUi((s) => { const n = { ...s, closed: true }; check(n); return n; });
  const flip = () => setUi((s) => { const n = { ...s, forward: !s.forward }; check(n); return n; });
  const lightUp = () => check(ui);
  const reset = () => { setResult(null); setUi(initialUi(goal)); };

  // The live combined value while the child is picking (bands visibly adding up).
  const pickedSum = ui.picks.reduce((sum, id) => sum + (partById(goal, id)?.ohms ?? 0), 0);

  return (
    <div className="krets-stage">
      <p className="krets-title">{goal.title}</p>
      <p className="krets-hint">{goal.hint}</p>

      {/* ── THE LOOP: parts sit ON a wire ring; left/bottom/right runs return to the battery so it
          reads as one closed circuit. The series row masks the ring's top run between parts. ── */}
      <div className={`krets-loop ${lit ? 'lit' : ''}`}>
        <div className="krets-ring">
        <div className="krets-series">
        <div className="krets-part krets-batt" aria-label="batteri">
          <img src="/elec/battery.svg" alt="" width={54} height={54} draggable={false} />
          <span className="krets-plus">+</span>
        </div>

        {/* resistor(s): the combine puzzle shows the picked pair (bands adding up); the others show
            the fixed resistor. */}
        <div className="krets-part krets-resistors">
          {goal.interaction === 'combine'
            ? ui.picks.map((id) => <WokwiResistor key={id} ohms={partById(goal, id)?.ohms ?? 0} />)
            : resistors.map((r) => <WokwiResistor key={r.id} ohms={r.ohms ?? 0} />)}
          {goal.interaction === 'combine' && ui.picks.length === 0 && <span className="krets-slot">?</span>}
        </div>

        {/* the gap the close puzzle snaps shut */}
        {goal.interaction === 'close' && (
          <button type="button" className={`krets-gap ${ui.closed ? 'closed' : ''}`} onClick={snapClosed} aria-label="snäpp ihop">
            {ui.closed ? '🔗' : '✂'}
          </button>
        )}

        {/* the LED — tappable in the flip puzzle */}
        <button
          type="button"
          className={`krets-part krets-led ${!circuit.ledForward ? 'reversed' : ''}`}
          onClick={goal.interaction === 'flip' ? flip : undefined}
          disabled={goal.interaction !== 'flip'}
          aria-label={goal.interaction === 'flip' ? 'vänd lysdioden' : 'lysdiod'}
        >
          <WokwiLed on={lit} />
        </button>
        </div>
        </div>
      </div>

      {/* ── THE COMBINE TRAY: real banded resistors to snap in. ── */}
      {goal.interaction === 'combine' && (
        <>
          <div className="krets-tray" aria-label="motstånd att välja">
            {resistors.map((r) => {
              const picked = ui.picks.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`krets-chip ${picked ? 'picked' : ''}`}
                  onClick={() => togglePick(r.id)}
                  disabled={!picked && ui.picks.length >= 2}
                >
                  <WokwiResistor ohms={r.ohms ?? 0} />
                  <span>{r.ohms} Ω</span>
                </button>
              );
            })}
          </div>
          <p className="krets-sum">
            {ui.picks.length > 0
              ? `${ui.picks.map((id) => `${partById(goal, id)?.ohms} Ω`).join(' + ')} = ${pickedSum} Ω`
              : 'Välj två motstånd.'}
            {goal.targetOhms != null && <> · mål: <b>{goal.targetOhms} Ω</b></>}
          </p>
          <button className="primary" disabled={!combineReady} onClick={lightUp}>Tänd lampan →</button>
        </>
      )}

      {goal.interaction === 'close' && !ui.closed && (
        <p className="krets-sum">Slingan är öppen — tryck på glappet för att snäppa ihop den.</p>
      )}
      {goal.interaction === 'flip' && (
        <p className="krets-sum">Tryck på lysdioden för att vända den.</p>
      )}

      {/* ── WITNESS (never reward). The scene is the feedback; a miss softens and re-serves. ── */}
      {result && (
        <div className={`krets-verdict ${result.ok ? 'ok' : 'soft'}`}>
          <p>{result.message}</p>
          {result.ok ? (
            <button className="primary" onClick={() => onDone?.()}>Nästa →</button>
          ) : (
            <button className="softbtn" onClick={reset}>Prova igen</button>
          )}
        </div>
      )}
    </div>
  );
}
