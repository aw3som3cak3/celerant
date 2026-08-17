'use client';

import { useState } from 'react';
import {
  type ModellingProblem,
  type Model,
  type Op,
  OPS,
  quantities,
  qval,
  withValues,
  evaluateModel,
  validate,
} from '@/lib/modelling';

// ModelStage — the APPLICATION-tier surface for a MODELLING problem. A NEW surface, deliberately
// NOT an InputStage input mode: InputStage exists to run a client CLOCK and capture ONE answer
// string that flows to the ledger, and modelling is untimed, multi-step, and not canonically
// graded. It reuses the RENDERING vocabulary — the ground-* picture-book scene, the numpad-key
// button look — so this is reused rendering, not a rebuilt look. It writes NOTHING: no clock, no
// θ, no ledger. The loop it proves, on ANY scenario:  gather → assume → assemble the structure →
// watch it compute → see it in the scene.  The scene validates the model; the child SUPERVISES.
//
// SCENARIO-AGNOSTIC. Everything specific to a situation — how many rows the plan has, what is
// gathered/assumed, and how the result is shown back — comes from the ModellingProblem descriptor,
// so pizza (× then ÷), fair sharing (÷ with a remainder) and the budget (+ then −) all run here.

type Phase = 'gather' | 'assume' | 'assemble' | 'compute' | 'scene';
type SlotRef = { row: number; slot: 'a' | 'b' };

// A row of actor emoji — reuses the ground-obj asset/scale from the recognition scene.
function Actors({ kind, n, counted, onTap }: { kind: string; n: number; counted?: number; onTap?: () => void }) {
  return (
    <div className="model-guests">
      {Array.from({ length: n }, (_, i) => (
        <img
          key={i}
          className={`ground-obj model-guest ${onTap ? 'tappable' : ''} ${counted != null && i < counted ? 'counted' : ''}`}
          src={`/emoji/${kind}.png`}
          alt=""
          draggable={false}
          onClick={onTap}
        />
      ))}
    </div>
  );
}

export function ModelStage({ problem, onDone }: { problem: ModellingProblem; onDone?: () => void }) {
  const startPhase: Phase = problem.gather ? 'gather' : problem.assume ? 'assume' : 'assemble';
  const [phase, setPhase] = useState<Phase>(startPhase);
  // L3 gathers a count and/or assumes a dialled value; L1/L2 have every quantity given. The
  // EFFECTIVE problem bakes those in so the pure evaluator/validator see what the child chose.
  const [gathered, setGathered] = useState<number>(0);
  const [assumed, setAssumed] = useState<number>(problem.assume ? qval(problem, problem.assume.quantityId) : 0);
  const overrides: Record<string, number> = {};
  if (problem.gather) overrides[problem.gather.quantityId] = gathered;
  if (problem.assume) overrides[problem.assume.quantityId] = assumed;
  const eff = withValues(problem, overrides);

  // At L2 (a distractor is present) the child fills the operand slots herself, CHOOSING which
  // quantities go in and leaving the irrelevant one out. Otherwise the operands are pre-placed from
  // the intended model and she picks only the operations.
  const editable = eff.quantities.some((q) => !q.relevant);
  const rowCount = problem.rowCount;

  const [firstA, setFirstA] = useState<string | null>(editable ? null : (problem.intended.rows[0].aId ?? null));
  const [rowB, setRowB] = useState<(string | null)[]>(
    editable ? Array(rowCount).fill(null) : problem.intended.rows.map((r) => r.bId),
  );
  const [rowOp, setRowOp] = useState<(Op | null)[]>(Array(rowCount).fill(null));
  const [active, setActive] = useState<SlotRef | null>(editable ? { row: 0, slot: 'a' } : null);
  const [revealRow, setRevealRow] = useState(0);

  const labelFor = (id: string | null): string => {
    if (id == null) return '?';
    const q = eff.quantities.find((x) => x.id === id);
    return q ? `${q.value} ${q.label}` : '?';
  };

  // The ordered operand slots: row-0 has A and B; each later row has only B (its A is the previous
  // result). Filling one advances to the next still-empty slot.
  const slotOrder: SlotRef[] = [{ row: 0, slot: 'a' }, ...Array.from({ length: rowCount }, (_, i) => ({ row: i, slot: 'b' as const }))];
  const slotValue = (s: SlotRef): string | null => (s.slot === 'a' ? firstA : rowB[s.row]);
  const setSlot = (s: SlotRef, id: string | null) => {
    if (s.slot === 'a') setFirstA(id);
    else setRowB((prev) => prev.map((v, i) => (i === s.row ? id : v)));
  };
  const fillSlot = (id: string) => {
    if (!active) return;
    setSlot(active, id);
    const filledNext = { ...Object.fromEntries(slotOrder.map((s) => [`${s.row}${s.slot}`, slotValue(s)])) };
    filledNext[`${active.row}${active.slot}`] = id;
    const nextEmpty = slotOrder.find((s) => filledNext[`${s.row}${s.slot}`] == null);
    setActive(nextEmpty ?? null);
  };
  const clearSlot = (s: SlotRef) => { setSlot(s, null); setActive(s); };

  const modelReady = firstA != null && rowB.every((b) => b != null) && rowOp.every((o) => o != null);
  const model: Model | null = modelReady
    ? { rows: rowB.map((b, i) => (i === 0 ? { aId: firstA!, bId: b!, op: rowOp[i]! } : { bId: b!, op: rowOp[i]! })) }
    : null;
  const evald = model ? evaluateModel(eff, model) : null;
  const judgement = evald ? validate(eff, evald) : null;

  const runCompute = () => {
    setPhase('compute');
    setRevealRow(0);
    for (let i = 1; i <= rowCount; i++) setTimeout(() => setRevealRow(i), 700 * i);
  };

  // ── GATHER (L3): tap actors to count them into a quantity. ──
  if (phase === 'gather' && problem.gather) {
    const g = problem.gather;
    return (
      <div className="model-stage">
        <p className="model-title">{problem.title}</p>
        <p className="model-step-hint">{g.hint}</p>
        <div className="model-scene">
          <Actors kind={g.actorKind} n={g.fullCount} counted={gathered} onTap={() => setGathered((n) => Math.min(g.fullCount, n + 1))} />
        </div>
        <p className="model-tally">Du har räknat <b>{gathered}</b></p>
        <button className="primary" disabled={gathered === 0} onClick={() => setPhase(problem.assume ? 'assume' : 'assemble')}>Klar</button>
      </div>
    );
  }

  // ── ASSUME (L3): dial a quantity. ANY reasonable value is accepted — choosing it IS a modelling
  // decision, so nothing here is "wrong". ──
  if (phase === 'assume' && problem.assume) {
    const a = problem.assume;
    return (
      <div className="model-stage">
        <p className="model-title">{problem.title}</p>
        <p className="model-step-hint">{a.hint}</p>
        <div className="model-scene model-dial-scene">
          <img className="ground-obj" src={`/emoji/${a.actorKind}.png`} alt="" draggable={false} style={{ width: 48, height: 48 }} />
          <div className="model-dial">
            <button className="numpad-key" aria-label="mindre" onClick={() => setAssumed((s) => Math.max(a.min, s - 1))} disabled={assumed <= a.min}>−</button>
            <span className="model-dial-value">{assumed}</span>
            <button className="numpad-key" aria-label="mer" onClick={() => setAssumed((s) => Math.min(a.max, s + 1))} disabled={assumed >= a.max}>+</button>
          </div>
          <span className="model-dial-unit">{a.unit}</span>
        </div>
        <button className="primary" onClick={() => setPhase('assemble')}>Klar</button>
      </div>
    );
  }

  // ── ASSEMBLE: build the model. Pick the operations, and at L2 which quantities to use. ──
  if (phase === 'assemble') {
    const opRow = (i: number) => (
      // An unchosen row pulses (`awaiting`) so it's clear EACH step needs a räknesätt — the two-step
      // pizza otherwise lets a child pick the first op and wonder why "Räkna ut" stays greyed.
      <div className={`model-ops ${rowOp[i] == null ? 'awaiting' : ''}`} role="group" aria-label="räknesätt">
        {OPS.map((o) => (
          <button key={o} className={`numpad-key model-op ${rowOp[i] === o ? 'on' : ''}`} onClick={() => setRowOp((prev) => prev.map((v, k) => (k === i ? o : v)))} type="button">
            {o}
          </button>
        ))}
      </div>
    );
    const slotBtn = (s: SlotRef) => {
      const id = slotValue(s);
      const isActive = active?.row === s.row && active?.slot === s.slot;
      return (
        <button
          type="button"
          className={`model-slot ${isActive ? 'active' : ''} ${id ? 'filled' : ''} ${editable ? '' : 'locked'}`}
          onClick={editable ? () => clearSlot(s) : undefined}
          disabled={!editable}
        >
          {labelFor(id)}
        </button>
      );
    };
    return (
      <div className="model-stage">
        <p className="model-title">{problem.title}</p>
        <p className="model-step-hint">Bygg en plan: vilka tal hör ihop, och hur?</p>

        {editable && (
          <div className="model-tray" aria-label="tal att välja">
            {quantities(eff).map((q) => {
              const used = firstA === q.id || rowB.includes(q.id);
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
          {Array.from({ length: rowCount }, (_, i) => (
            <div key={i}>
              {i > 0 && <div className="model-plan-arrow">↓ ger</div>}
              <div className="model-plan-row">
                {i === 0 ? slotBtn({ row: 0, slot: 'a' }) : <span className="model-slot result">resultatet</span>}
                {opRow(i)}
                {slotBtn({ row: i, slot: 'b' })}
              </div>
            </div>
          ))}
        </div>

        <button className="primary" disabled={!modelReady} onClick={runCompute}>Räkna ut →</button>
        {!modelReady && (
          <p className="model-need">
            {firstA == null || rowB.some((b) => b == null)
              ? 'Fyll i alla tal först.'
              : rowCount > 1
                ? 'Välj ett räknesätt (× ÷ + −) i varje steg.'
                : 'Välj ett räknesätt (× ÷ + −).'}
          </p>
        )}
      </div>
    );
  }

  // ── COMPUTE: the calculator does the arithmetic FOR the child — she watches, she does not type.
  // Rows reveal one after another. ──
  if (phase === 'compute' && evald) {
    return (
      <div className="model-stage">
        <p className="model-title">Räknar ut…</p>
        <div className="model-calc">
          {evald.rows.map((r, i) => (
            <div key={i} className={`model-calc-row ${revealRow >= i + 1 ? 'show' : ''}`}>
              {r.a} {r.op} {r.b} = <b>{r.value}</b>
              {r.remainder > 0 && <span className="model-roundup"> rest {r.remainder}</span>}
              {r.rounded && <span className="model-roundup"> (avrundat uppåt)</span>}
            </div>
          ))}
        </div>
        <button className="primary" disabled={revealRow < rowCount} onClick={() => setPhase('scene')}>Se i rummet →</button>
      </div>
    );
  }

  // ── SCENE: the result shown back IN the situation. The SITUATION validates the model. Non-
  // punitive: "does this make sense?", and the child decides whether to keep it or change it. No
  // score, no red pen. The picture is scenario-specific — that is the point (the scene is the key).
  if (phase === 'scene' && evald && judgement) {
    return (
      <div className="model-stage">
        <p className="model-title">{problem.title}</p>
        <div className={`model-scene model-verdict-${judgement.verdict}`}>
          {problem.sceneMode === 'pile' && <PileScene problem={eff} result={evald.result} />}
          {problem.sceneMode === 'share' && <ShareScene problem={eff} each={evald.result} leftover={evald.remainder} />}
          {problem.sceneMode === 'budget' && <BudgetScene problem={eff} over={evald.result} total={evald.rows[0]?.value ?? 0} />}
        </div>
        <p className={`model-verdict-msg v-${judgement.verdict}`}>{judgement.message}</p>
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

// pile: the actors, plus a pile of the ordered unit (pizzas). Multiply where you should divide and
// the pile buries the room; too few and the plates are empty.
function PileScene({ problem, result }: { problem: ModellingProblem; result: number }) {
  const drawn = Math.min(Math.max(0, result), 24);
  return (
    <>
      <Actors kind={problem.actorKind} n={qval(problem, problem.actorCountId)} />
      <div className="model-pizzas">
        {Array.from({ length: drawn }, (_, i) => (
          <img key={i} className="ground-obj model-pizza" src={`/emoji/${problem.resultKind}.png`} alt="" draggable={false} />
        ))}
        {result > drawn && <span className="model-pizza-more">+{result - drawn}</span>}
      </div>
      <p className="model-result-line">Din plan: <b>{result} {problem.resultUnit}</b></p>
    </>
  );
}

// share: each animal with its share drawn beside it, and the leftover in a "blir över" pile — so an
// unequal or impossible share is visible at a glance.
function ShareScene({ problem, each, leftover }: { problem: ModellingProblem; each: number; leftover: number }) {
  const sharers = qval(problem, 'sharers');
  const perActor = Math.min(Math.max(0, each), 8);
  return (
    <div className="model-share">
      <div className="model-share-actors">
        {Array.from({ length: sharers }, (_, i) => (
          <div key={i} className="model-share-card">
            <img className="ground-obj" src={`/emoji/${problem.actorKind}.png`} alt="" draggable={false} />
            <div className="model-share-treats">
              {Array.from({ length: perActor }, (_, k) => (
                <img key={k} className="model-treat" src={`/emoji/${problem.resultKind}.png`} alt="" draggable={false} />
              ))}
              {each > perActor && <span className="model-pizza-more">+{each - perActor}</span>}
            </div>
          </div>
        ))}
      </div>
      {leftover > 0 && (
        <div className="model-leftover">
          <span>blir över:</span>
          {Array.from({ length: Math.min(leftover, 8) }, (_, k) => (
            <img key={k} className="model-treat" src={`/emoji/${problem.resultKind}.png`} alt="" draggable={false} />
          ))}
        </div>
      )}
      <p className="model-result-line">Var och en får <b>{each} {problem.resultUnit}</b></p>
    </div>
  );
}

// budget: the goods on the table and the wallet outcome — money left, or short. No coin asset, so
// the money is named, not drawn (the tint carries the enough/not-enough feeling).
function BudgetScene({ problem, over, total }: { problem: ModellingProblem; over: number; total: number }) {
  return (
    <div className="model-budget">
      <div className="model-goods">
        {(problem.goods ?? []).map((k, i) => (
          <img key={i} className="ground-obj" src={`/emoji/${k}.png`} alt="" draggable={false} style={{ width: 44, height: 44 }} />
        ))}
      </div>
      <p className="model-result-line">Kostar <b>{total} kr</b> — plånboken har {qval(problem, 'budget')} kr</p>
      <p className="model-budget-outcome">{over <= 0 ? `${-over} kr kvar 🪙` : `saknas ${over} kr`}</p>
    </div>
  );
}
