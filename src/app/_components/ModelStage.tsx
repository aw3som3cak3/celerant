'use client';

import { useMemo, useState } from 'react';
import {
  type ModellingProblem,
  type Model,
  type Op,
  type Quantity,
  OPS,
  quantities,
  evaluateModel,
  validate,
} from '@/lib/modelling';

// ModelStage — the APPLICATION-tier surface for a MODELLING problem. A NEW surface, deliberately
// NOT an InputStage input mode: InputStage exists to run a client CLOCK and capture ONE answer
// string that flows to the ledger, and modelling is untimed, multi-step, and not canonically
// graded. It DOES reuse the rendering vocabulary — the ground-* picture-book scene, the numpad-key
// button look — so this is reused rendering, not a rebuilt look. It writes NOTHING: no clock, no
// θ, no ledger. The loop it proves:  gather → assume → assemble the structure → watch it compute →
// see it in the scene.  The scene validates the model; the child SUPERVISES (pilot, not passenger).

type Phase = 'gather' | 'assume' | 'assemble' | 'compute' | 'scene';

// A row of guest emoji — reuses the ground-obj asset/scale from the recognition scene.
function Guests({ kind, n, counted, onTap }: { kind: string; n: number; counted?: number; onTap?: (i: number) => void }) {
  return (
    <div className="model-guests">
      {Array.from({ length: n }, (_, i) => (
        <img
          key={i}
          className={`ground-obj model-guest ${onTap ? 'tappable' : ''} ${counted != null && i < counted ? 'counted' : ''}`}
          src={`/emoji/${kind}.png`}
          alt=""
          draggable={false}
          onClick={onTap ? () => onTap(i) : undefined}
        />
      ))}
    </div>
  );
}

export function ModelStage({ problem, onDone }: { problem: ModellingProblem; onDone?: () => void }) {
  // L3 gathers the guest count and assumes slices-each; L1/L2 have both given. The EFFECTIVE
  // problem carries whatever the child gathered/assumed, so the pure evaluator/validator see it.
  const startPhase: Phase = problem.gather ? 'gather' : problem.assume ? 'assume' : 'assemble';
  const [phase, setPhase] = useState<Phase>(startPhase);
  const [gathered, setGathered] = useState<number>(problem.gather ? 0 : problem.guests);
  const [slicesEach, setSlicesEach] = useState<number>(problem.slicesEach);

  const eff: ModellingProblem = { ...problem, guests: gathered, slicesEach };
  const tray = useMemo(() => quantities(eff), [eff.guests, eff.slicesEach, eff.distractor]); // eslint-disable-line react-hooks/exhaustive-deps
  const editableOperands = !!problem.distractor; // L2: the child chooses WHICH quantities go in

  // The assembled model. At L1/L3 the operands are pre-placed (child picks only the operations);
  // at L2 the operand slots start empty and the child fills them from the tray, leaving the
  // irrelevant number out — that omission IS the L2 modelling decision.
  const [row1A, setRow1A] = useState<Quantity['id'] | null>(editableOperands ? null : 'guests');
  const [row1B, setRow1B] = useState<Quantity['id'] | null>(editableOperands ? null : 'slicesEach');
  const [row2B, setRow2B] = useState<Quantity['id'] | null>(editableOperands ? null : 'slicesPerPizza');
  const [row1Op, setRow1Op] = useState<Op | null>(null);
  const [row2Op, setRow2Op] = useState<Op | null>(null);
  const [active, setActive] = useState<'r1a' | 'r1b' | 'r2b' | null>(editableOperands ? 'r1a' : null);

  const [revealRow, setRevealRow] = useState(0); // compute animation: 0 none, 1 row1, 2 both

  const labelFor = (id: Quantity['id'] | null): string => {
    if (id == null) return '?';
    const q = tray.find((x) => x.id === id);
    return q ? `${q.value} ${q.label}` : '?';
  };

  const fillSlot = (id: Quantity['id']) => {
    if (!active) return;
    if (active === 'r1a') { setRow1A(id); setActive('r1b'); }
    else if (active === 'r1b') { setRow1B(id); setActive('r2b'); }
    else if (active === 'r2b') { setRow2B(id); setActive(null); }
  };

  const modelReady = row1A && row1B && row2B && row1Op && row2Op;
  const model: Model | null = modelReady
    ? { row1: { aId: row1A!, bId: row1B!, op: row1Op! }, row2: { bId: row2B!, op: row2Op! } }
    : null;
  const evald = model ? evaluateModel(eff, model) : null;
  const verdict = evald ? validate(eff, evald.result, slicesEach) : null;

  const runCompute = () => {
    setPhase('compute');
    setRevealRow(0);
    setTimeout(() => setRevealRow(1), 700);
    setTimeout(() => setRevealRow(2), 1600);
  };

  // ── GATHER (L3): tap each guest to count them; the tally becomes the "guests" quantity. ──
  if (phase === 'gather') {
    return (
      <div className="model-stage">
        <p className="model-title">{problem.title}</p>
        <p className="model-step-hint">Räkna gästerna — tryck på varje djur.</p>
        <div className="model-scene">
          <Guests kind={problem.guestKind} n={problem.guests} counted={gathered} onTap={() => setGathered((g) => Math.min(problem.guests, g + 1))} />
        </div>
        <p className="model-tally">Du har räknat <b>{gathered}</b> gäster</p>
        <button className="primary" disabled={gathered === 0} onClick={() => setPhase(problem.assume ? 'assume' : 'assemble')}>
          Klar
        </button>
      </div>
    );
  }

  // ── ASSUME (L3): a dial for slices-each. ANY reasonable value is accepted — choosing it IS a
  // modelling decision, so nothing here is "wrong". ──
  if (phase === 'assume') {
    const { min, max } = problem.assumeRange;
    return (
      <div className="model-stage">
        <p className="model-title">{problem.title}</p>
        <p className="model-step-hint">Hur många bitar äter varje gäst? Du bestämmer.</p>
        <div className="model-scene model-dial-scene">
          <img className="ground-obj" src={`/emoji/${problem.guestKind}.png`} alt="" draggable={false} style={{ width: 48, height: 48 }} />
          <div className="model-dial">
            <button className="numpad-key" aria-label="färre" onClick={() => setSlicesEach((s) => Math.max(min, s - 1))} disabled={slicesEach <= min}>−</button>
            <span className="model-dial-value">{slicesEach}</span>
            <button className="numpad-key" aria-label="fler" onClick={() => setSlicesEach((s) => Math.min(max, s + 1))} disabled={slicesEach >= max}>+</button>
          </div>
          <span className="model-dial-unit">bitar var</span>
        </div>
        <button className="primary" onClick={() => setPhase('assemble')}>Klar</button>
      </div>
    );
  }

  // ── ASSEMBLE: build the model. Pick the operations (L1/L3) and, at L2, which quantities to use. ──
  if (phase === 'assemble') {
    const opRow = (value: Op | null, set: (o: Op) => void) => (
      <div className="model-ops" role="group" aria-label="räknesätt">
        {OPS.map((o) => (
          <button key={o} className={`numpad-key model-op ${value === o ? 'on' : ''}`} onClick={() => set(o)} type="button">
            {o}
          </button>
        ))}
      </div>
    );
    // Activating a slot CLEARS it (freeing its chip back to the tray), so a child can re-pick.
    const clearSlot = (which: 'r1a' | 'r1b' | 'r2b') => {
      if (which === 'r1a') setRow1A(null);
      else if (which === 'r1b') setRow1B(null);
      else setRow2B(null);
      setActive(which);
    };
    const slot = (id: Quantity['id'] | null, which: 'r1a' | 'r1b' | 'r2b', locked: boolean) => (
      <button
        type="button"
        className={`model-slot ${active === which ? 'active' : ''} ${id ? 'filled' : ''} ${locked ? 'locked' : ''}`}
        onClick={locked ? undefined : () => clearSlot(which)}
        disabled={locked}
      >
        {labelFor(id)}
      </button>
    );
    return (
      <div className="model-stage">
        <p className="model-title">{problem.title}</p>
        <p className="model-step-hint">Bygg en plan: vilka tal hör ihop, och hur?</p>

        {editableOperands && (
          <div className="model-tray" aria-label="tal att välja">
            {tray.map((q) => {
              const used = [row1A, row1B, row2B].includes(q.id);
              return (
                <button key={q.id} type="button" className={`model-chip ${used ? 'used' : ''}`} onClick={() => !used && active && fillSlot(q.id)} disabled={used || !active}>
                  <b>{q.value}</b> {q.label}
                </button>
              );
            })}
            <p className="model-tray-hint">Alla tal behövs inte — välj de som hör ihop.</p>
          </div>
        )}

        <div className="model-plan">
          <div className="model-plan-row">
            {slot(row1A, 'r1a', !editableOperands)}
            {opRow(row1Op, setRow1Op)}
            {slot(row1B, 'r1b', !editableOperands)}
          </div>
          <div className="model-plan-arrow">↓ ger</div>
          <div className="model-plan-row">
            <span className="model-slot result">resultatet</span>
            {opRow(row2Op, setRow2Op)}
            {slot(row2B, 'r2b', !editableOperands)}
          </div>
        </div>

        <button className="primary" disabled={!modelReady} onClick={runCompute}>Räkna ut →</button>
      </div>
    );
  }

  // ── COMPUTE: the calculator does the arithmetic FOR the child (spec) — she watches, she does
  // not type. Rows reveal one after another. ──
  if (phase === 'compute' && evald) {
    return (
      <div className="model-stage">
        <p className="model-title">Räknar ut…</p>
        <div className="model-calc">
          <div className={`model-calc-row ${revealRow >= 1 ? 'show' : ''}`}>
            {evald.row1.a} {evald.row1.op} {evald.row1.b} = <b>{evald.row1.value}</b>
            {evald.row1.rounded && <span className="model-roundup"> (avrundat uppåt)</span>}
          </div>
          <div className={`model-calc-row ${revealRow >= 2 ? 'show' : ''}`}>
            {evald.row2.a} {evald.row2.op} {evald.row2.b} = <b>{evald.row2.value}</b>
            {evald.row2.rounded && <span className="model-roundup"> (avrundat uppåt — hela pizzor)</span>}
          </div>
        </div>
        <button className="primary" disabled={revealRow < 2} onClick={() => setPhase('scene')}>Se i rummet →</button>
      </div>
    );
  }

  // ── SCENE: the result shown back IN the situation. The SITUATION validates the model — a full
  // room, empty plates, or a room buried in pizza. Non-punitive: "does this make sense?", and the
  // child decides whether to keep it or change it. No score, no red pen. ──
  if (phase === 'scene' && evald && verdict) {
    const drawn = Math.min(evald.result, 24); // cap the drawing; the message still names the real count
    return (
      <div className="model-stage">
        <p className="model-title">{problem.title}</p>
        <div className={`model-scene model-verdict-${verdict.verdict}`}>
          <Guests kind={problem.guestKind} n={eff.guests} />
          <div className="model-pizzas">
            {Array.from({ length: Math.max(0, drawn) }, (_, i) => (
              <img key={i} className="ground-obj model-pizza" src="/emoji/pizza.png" alt="" draggable={false} />
            ))}
            {evald.result > drawn && <span className="model-pizza-more">+{evald.result - drawn}</span>}
          </div>
        </div>
        <p className="model-result-line">Din plan: <b>{evald.result} pizzor</b> för {eff.guests} gäster.</p>
        <p className={`model-verdict-msg v-${verdict.verdict}`}>{verdict.message}</p>
        <p className="model-ask">Ser det klokt ut?</p>
        <div className="model-judge">
          <button className="primary" onClick={() => onDone?.()}>Ja, det stämmer</button>
          <button className="softbtn" onClick={() => { setPhase('assemble'); setRevealRow(0); }}>Nej, ändra planen</button>
        </div>
      </div>
    );
  }

  return null;
}
