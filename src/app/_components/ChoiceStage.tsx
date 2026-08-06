'use client';

import { useEffect, useRef } from 'react';
import type { ChoicePromptData, ChoiceOption } from '@/lib/choice';

export type { ChoicePromptData, ChoiceOption } from '@/lib/choice';

// The RECOGNITION input surface: a picture prompt + tap-one-of-N options. The choice
// sibling of the numpad (InputStage) and the letter pad — the third format the practice
// flow dispatches to once GROUND's Fler/Färre / pick-the-amount rungs are graph skills
// (one-ova-track WS II). It reuses InputStage's exact discipline: a two-rAF client clock
// started when the item paints, stopped on the tap, reported as intervalMs — so a
// recognition rung is timed on the same contract as everything else (as grounding
// evidence; recognition is never a fluency/sprint target). Grading is the caller's: the
// tapped value flows back through onCapture and is graded by the shared grade() (a
// numeral against an int answer, or 'combine'/'separate' against a word answer).

function Objects({ kind, n, small }: { kind: string; n: number; small?: boolean }) {
  return (
    <div className={`ground-cluster ${small ? 'small' : ''}`}>
      {Array.from({ length: n }, (_, i) => (
        <img key={i} className={`ground-obj ${small ? 'small' : ''}`} src={`/emoji/${kind}.png`} alt="" draggable={false} />
      ))}
    </div>
  );
}

export function ChoiceStage({
  itemKey,
  prompt,
  question,
  options,
  onCapture,
  disabled = false,
  armKey,
}: {
  itemKey: string | number; // changes per item ⇒ resets and restarts the clock (mount-equivalent)
  prompt: ChoicePromptData;
  question: string;
  options: ChoiceOption[];
  onCapture: (chosen: string | number, intervalMs: number) => void;
  disabled?: boolean;
  armKey?: number; // bump to RE-ARM after a first-wrong tap — accept a second tap, KEEP the clock
}) {
  const startRef = useRef(0);
  const capturedRef = useRef(false);

  useEffect(() => {
    capturedRef.current = false;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        startRef.current = performance.now();
      });
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [itemKey]);

  // Re-arm the SAME item for a retry: accept another tap but DON'T reset the clock (its
  // interval spans render→final tap, as with InputStage). Guarded so it never fires on mount.
  const armedRef = useRef(armKey);
  useEffect(() => {
    if (armKey === armedRef.current) return;
    armedRef.current = armKey;
    capturedRef.current = false;
  }, [armKey]);

  const pick = (value: string | number) => {
    if (capturedRef.current || disabled) return;
    capturedRef.current = true;
    const intervalMs = Math.max(0, Math.round(performance.now() - startRef.current));
    onCapture(value, intervalMs);
  };

  const isStructure = prompt.show === 'structure';

  return (
    <div className="input-stage">
      <div className="ground-stage">
        {prompt.show === 'group' ? (
          <div className="ground-prompt">
            <Objects kind={prompt.kind} n={prompt.a} />
          </div>
        ) : prompt.show === 'sum' ? (
          <div className="ground-prompt">
            <Objects kind={prompt.kind} n={prompt.a} />
            <span className="ground-plus">+</span>
            <Objects kind={prompt.kind} n={prompt.b} />
          </div>
        ) : (
          <div className="ground-groups">
            <Objects kind={prompt.kind} n={prompt.a} />
            <Objects kind={prompt.kind} n={prompt.b} />
          </div>
        )}
      </div>

      <p className="ground-q">{question}</p>

      {isStructure ? (
        <div className="ground-choices">
          {options.map((o, i) =>
            o.render === 'more' || o.render === 'fewer' ? (
              <button key={i} className={`ground-choice ${o.render === 'more' ? 'more' : 'fewer'}`} onClick={() => pick(o.value)} disabled={disabled} type="button">
                <span className="ground-choice-glyph">{o.render === 'more' ? '▲' : '▼'}</span>
                {o.label}
              </button>
            ) : null,
          )}
        </div>
      ) : (
        <div className={`ground-options ${options[0] && options[0].render === 'group' ? 'group' : 'numeral'}`}>
          {options.map((o, i) =>
            o.render === 'numeral' ? (
              <button key={i} className="ground-option" onClick={() => pick(o.value)} disabled={disabled} type="button">
                <span className="ground-numeral">{o.value}</span>
              </button>
            ) : o.render === 'group' ? (
              <button key={i} className="ground-option" onClick={() => pick(o.value)} disabled={disabled} type="button">
                <Objects kind={o.kind} n={o.value} small />
              </button>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
