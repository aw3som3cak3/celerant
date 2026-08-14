'use client';

import { useCallback, useState } from 'react';
import { InputStage, type StageItem, type Captured } from './InputStage';
import { ChoiceStage } from './ChoiceStage';
import { buildScaffold, buildWordScaffold, hintFor, L_FULL, L_PARTIAL, L_CUED, type StrategyId } from '@/lib/acquisition-content';
import { grade } from '@/lib/grade';

// ── SCAFFOLDED ACQUISITION — the child-facing surface (spec §3, §5) ─────────
//
// A faded, self-teaching derivation of ONE instance (6 × 7), rendered on the SAME numpad and
// the SAME clock as every other item: no new pad, no second input path. The level says how much
// of the derivation is shown:
//
//   L0 full     5 × 7 = ?  →  35 + 7 = ?  →  6 × 7 = ?     (a sequence, ONE unit)
//   L1 partial  6 × 7 = 35 + 7 =                            (one prompt; she does the last step)
//   L2 cued     6 × 7 =   with the strategy as a quiet tip  (one prompt)
//   L3 bare     — never reaches here; it is the ordinary item
//
// ONLY THE FINAL TARGET IS AN ATTEMPT. The L0 sub-steps are INERT (open question §9.3): they
// write nothing, score nothing and time nothing — they are the worked example she works. That
// keeps two things true at once: the ledger records exactly one resolved item per served item
// (the counter, the θ update, the session all stay as they were), and a sub-step she fumbles
// costs her nothing. A wrong or unknown sub-step simply SHOWS its value and moves on: every
// level must be winnable, and a miss softens the scaffold rather than punishing it.
export function AcquisitionStage({
  item,
  level,
  strategy,
  playerId,
  locale,
  onCapture,
  disabled,
  showIdk,
  idkLabel,
  armKey,
  letters,
  dictation,
}: {
  item: StageItem;
  level: number;
  strategy: StrategyId;
  playerId: string;
  locale: string;
  onCapture: (c: Captured) => void;
  disabled?: boolean;
  showIdk?: boolean;
  idkLabel?: React.ReactNode;
  armKey?: number;
  // WORD SUBJECTS: present ⇒ this is a spelling/English dictation item. `letters` is the letter pad's
  // glyphs (the tier's letters), `dictation` the play-audio prompt node. Their presence routes to the
  // word path (rule-application-fade / cue-fade); absent ⇒ the maths numpad path below, unchanged.
  letters?: readonly string[];
  dictation?: React.ReactNode;
}) {
  // A word item (spelling/English) uses the letter pad + choice-tap sub-steps, never the numpad.
  if (letters) {
    return (
      <WordAcquisitionStage
        item={item} level={level} strategy={strategy} playerId={playerId}
        onCapture={onCapture} disabled={disabled} showIdk={showIdk} idkLabel={idkLabel}
        armKey={armKey} letters={letters} dictation={dictation}
      />
    );
  }
  // Built from (code, seed, strategy) with the SAME shared builder the server reasons about —
  // the answer key never crosses the wire, exactly as for an ordinary item.
  const scaffold = buildScaffold(item.code, item.seed, strategy);
  const [step, setStep] = useState(0); // index into the sub-steps; === length ⇒ the target
  const [shown, setShown] = useState<string[]>([]); // sub-steps already solved (or revealed)
  const [reveal, setReveal] = useState<string | null>(null); // a sub-step's value, after a fumble

  const onSubStep = useCallback(
    (c: Captured) => {
      if (!scaffold) return;
      const s = scaffold.substeps[step];
      if (!s) return;
      if (!c.idk && grade(c.given, s.answer)) {
        setShown((prev) => [...prev, `${s.prompt} ${s.answer}`]);
        setStep((i) => i + 1);
        return;
      }
      // Not right, or "vet inte": show what it is and carry on. No retry, no mark, no record —
      // this is a worked example, not a test.
      setReveal(`${s.prompt} ${s.answer}`);
    },
    [scaffold, step],
  );

  const afterReveal = useCallback(() => {
    const s = scaffold?.substeps[step];
    if (s) setShown((prev) => [...prev, `${s.prompt} ${s.answer}`]);
    setReveal(null);
    setStep((i) => i + 1);
  }, [scaffold, step]);

  // A malformed strategy/instance can never leave the child stuck: fall back to the bare item.
  if (!scaffold) {
    return <InputStage mode="session" item={item} playerId={playerId} onCapture={onCapture} disabled={disabled} showIdk={showIdk} idkLabel={idkLabel} armKey={armKey} />;
  }

  if (level === L_PARTIAL) {
    // The decomposition is already done; one operation left. The answer is still the target's,
    // so the server grades it exactly as it grades the bare fact.
    return (
      <InputStage
        mode="session"
        item={item}
        playerId={playerId}
        onCapture={onCapture}
        disabled={disabled}
        showIdk={showIdk}
        idkLabel={idkLabel}
        armKey={armKey}
        promptOverride={scaffold.partial}
      />
    );
  }

  if (level === L_CUED) {
    // The bare fact, with the strategy she has been walking as a quiet tip — never the answer.
    return (
      <InputStage
        mode="session"
        item={item}
        playerId={playerId}
        onCapture={onCapture}
        disabled={disabled}
        showIdk={showIdk}
        idkLabel={idkLabel}
        armKey={armKey}
        promptNode={
          <span className="acq-cued">
            {scaffold.target}
            <span className="acq-hint">{hintFor(strategy, scaffold.b, locale)}</span>
          </span>
        }
      />
    );
  }

  // L0 — the full walk. Solved lines stay on screen: by the time the target appears she is
  // reading her OWN work, which is the whole point (she builds 42, she doesn't read it).
  const onTarget = step >= scaffold.substeps.length;
  const sub = scaffold.substeps[step];
  return (
    <div className="acq-stage">
      {shown.length > 0 && (
        <div className="acq-steps">
          {shown.map((line, i) => (
            <div key={i} className="acq-step">{line}</div>
          ))}
        </div>
      )}
      {reveal ? (
        <div className="acq-reveal">
          <div className="prompt">{reveal}</div>
          <button className="next-btn" onClick={afterReveal} type="button">{locale === 'en' ? 'Next' : 'Vidare'}</button>
        </div>
      ) : (
        <InputStage
          // Remount per step: the entry clears and the (unused, warmup-class) clock restarts on
          // each prompt, since code/seed are the same for the whole unit.
          key={onTarget ? 'target' : `sub-${step}`}
          mode="session"
          item={item}
          playerId={playerId}
          onCapture={onTarget ? onCapture : onSubStep}
          disabled={disabled}
          showIdk={showIdk}
          idkLabel={idkLabel}
          armKey={onTarget ? armKey : undefined}
          promptOverride={onTarget ? scaffold.target : sub.prompt}
        />
      )}
    </div>
  );
}

// ── WORD SUBJECTS · the same fade primitive on the letter pad + choice taps ──────────────────
//
// The support differs from maths (a discrimination WALK for rule-fade, a fading CUE for cue-fade)
// but the contract is identical: only the produced TARGET is a recorded attempt; the L0
// discrimination sub-steps are INERT (a wrong/idk tap reveals its value and carries on — errorless,
// never marked). The target is the ordinary letter-pad dictation, graded by grade() as today, so a
// scaffolded word never changes what the server grades. Reuses ChoiceStage (discrimination) and the
// existing letter-pad InputStage (production) — no third input surface.
function WordAcquisitionStage({
  item, level, strategy, playerId, onCapture, disabled, showIdk, idkLabel, armKey, letters, dictation,
}: {
  item: StageItem;
  level: number;
  strategy: StrategyId;
  playerId: string;
  onCapture: (c: Captured) => void;
  disabled?: boolean;
  showIdk?: boolean;
  idkLabel?: React.ReactNode;
  armKey?: number;
  letters: readonly string[];
  dictation?: React.ReactNode;
}) {
  const scaffold = buildWordScaffold(item.code, item.seed, strategy);
  const [step, setStep] = useState(0); // index into the L0 discrimination sub-steps
  const [reveal, setReveal] = useState<string | null>(null);

  const sub = scaffold?.substeps[step];
  const onSub = useCallback(
    (given: string, idk: boolean) => {
      if (!sub) return;
      if (!idk && grade(given, sub.answer)) {
        setStep((i) => i + 1);
        return;
      }
      // Errorless: show the right answer and carry on. No retry, no mark, no record.
      setReveal(sub.answer);
    },
    [sub],
  );
  const afterReveal = useCallback(() => {
    setReveal(null);
    setStep((i) => i + 1);
  }, []);

  // The cue is a HINT, never the answer template: a labelled "Tips" row (visually distinct, above
  // the pad) that she may use as a memory aid. A faded/gapped word ("V_T") shown here can no longer
  // be misread as fill-in-the-blank — the answer AREA (below) is full-length slots for the WHOLE
  // word, so at every fade level she produces the whole word and the cue only thins.
  const tips = (cue: string | null) =>
    cue == null ? null : (
      <div className="acq-tips" aria-label="tips">
        <span className="acq-tips-label">Tips</span>
        <span className="acq-cue">{cue}</span>
      </div>
    );

  // The produced target: the ordinary letter-pad dictation. `slots` = the WHOLE word's length, so
  // the answer area shows one slot per letter and she always produces the whole word.
  const target = (cue: string | null) => (
    <InputStage
      key="word-target"
      mode="session"
      item={item}
      playerId={playerId}
      onCapture={onCapture}
      disabled={disabled}
      showIdk={showIdk}
      idkLabel={idkLabel}
      armKey={armKey}
      letters={letters}
      slots={item.answerLength}
      promptNode={
        <div className="acq-word-prompt">
          {dictation}
          {tips(cue)}
        </div>
      }
    />
  );

  // A malformed derivation can never leave the child stuck: fall back to the bare dictation item.
  if (!scaffold) {
    return (
      <InputStage
        mode="session" item={item} playerId={playerId} onCapture={onCapture} disabled={disabled}
        showIdk={showIdk} idkLabel={idkLabel} armKey={armKey} letters={letters} slots={item.answerLength}
        promptNode={<div className="acq-word-prompt">{dictation}</div>}
      />
    );
  }

  // L1 / L2 — no walk, just the target with the (thinning) cue.
  if (level === L_CUED) return target(scaffold.cueAt(L_CUED));
  if (level === L_PARTIAL) return target(scaffold.cueAt(L_PARTIAL));

  // L0 — walk the INERT discrimination sub-steps (a CHOICE tap or a letter-pad gap), then the target.
  if (step >= scaffold.substeps.length) return target(scaffold.cueAt(L_FULL));
  if (reveal != null) {
    return (
      <div className="acq-stage">
        <div className="acq-reveal">
          <div className="prompt">{reveal}</div>
          <button className="next-btn" onClick={afterReveal} type="button">Vidare</button>
        </div>
      </div>
    );
  }
  if (sub!.kind === 'choice') {
    return (
      <ChoiceStage
        itemKey={`word-sub-${step}`}
        prompt={sub!.prompt}
        question={sub!.question}
        options={sub!.options}
        onCapture={(v) => onSub(String(v), false)}
        disabled={disabled}
      />
    );
  }
  // A letter-pad gap sub-step (a gapped word she completes) — inert, same reveal-and-carry contract.
  return (
    <InputStage
      key={`word-sub-${step}`}
      mode="session"
      item={item}
      playerId={playerId}
      onCapture={(c) => onSub(c.given, c.idk)}
      disabled={disabled}
      showIdk={showIdk}
      idkLabel={idkLabel}
      letters={letters}
      promptNode={<div className="acq-word-prompt"><div className="acq-cue">{sub!.cue}</div>{dictation}</div>}
    />
  );
}
