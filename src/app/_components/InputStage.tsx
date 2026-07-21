'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { buildItem, isAnswerComplete } from '@/lib/item';
import { inputModeFor } from './AnswerInput';
import { useWakeLock } from './useWakeLock';
import { newIdemKey } from './answerQueue';

// The shared input surface + per-item clock, used by BOTH sessions and sprints so a
// rate measured in one is comparable to a rate measured in the other (input-timing
// work). It owns:
//  - the on-screen NUMPAD (#1): our own big-target pad, always mounted, never the OS
//    keyboard — no appear-latency, nothing covering the screen. Desktop physical
//    keys feed the same path.
//  - the CLIENT-MEASURED interval (#4): started when the item is painted+interactable
//    (rAF after mount), stopped the instant the answer is captured. Computed locally
//    with performance.now(); the network is never in the measured path.
//  - AUTO-SUBMIT vs EXPLICIT submit (#2): a mode prop. Sprints auto-submit when the
//    entered digits reach the server-issued answerLength (the cleanest timing
//    boundary — the tap that completes the answer stops the clock, no debounce).
//    Sessions keep the explicit ✓. A small ✓ is always present as a fallback.
//  - the WAKE-LOCK (#5): held while a problem is on screen.
// On capture it stops the clock and calls onCapture with a stable idemKey and the
// client-measured interval; the surrounding page owns delivery (durable enqueue +
// grade + advance), which differs by mode — sessions have a first-wrong retry that
// must NOT be durably recorded, sprints record every capture. The clock has already
// stopped, so however long delivery takes it is outside the measured interval.

export type StageItem = {
  code: string;
  seed: number; // server-issued
  family: string;
  answerLength: number; // server-issued digit count, for sprint auto-submit
};

export type Captured = {
  idemKey: string;
  code: string;
  seed: number;
  given: string;
  intervalMs: number;
  idk: boolean; // "vet inte" — resolves the item without an answer (session only)
};

function renderPrompt(prompt: string): React.ReactNode {
  if (!prompt.includes('□')) return prompt;
  return prompt
    .split('□')
    .flatMap((part, i, arr) => (i < arr.length - 1 ? [part, <span key={i} className="blank-box">?</span>] : [part]));
}

export function InputStage({
  mode,
  item,
  playerId,
  onCapture,
  disabled = false,
  showIdk = false,
  idkLabel,
  armKey,
  promptOverride,
}: {
  mode: 'session' | 'sprint';
  item: StageItem | null;
  playerId: string; // for the idemKey
  onCapture: (c: Captured) => void;
  disabled?: boolean;
  showIdk?: boolean; // session: render a "vet inte" button
  idkLabel?: string;
  armKey?: number; // bump to RE-ARM the same item for a retry (clears the entry, KEEPS the clock)
  // The writing-speed probe drives a "copy this number" task through this same
  // numpad + clock (so the input floor is measured on the surface the child actually
  // answers with): it passes the number to show here instead of a generated problem.
  promptOverride?: string;
}) {
  const [value, setValue] = useState('');
  const valueRef = useRef(''); // authoritative current value (avoids stale-closure on fast taps)
  const startRef = useRef(0); // client clock start (item interactable), performance.now()
  const capturedRef = useRef(false);

  const allowSign = item ? inputModeFor(item.family) === 'text' : false; // −,/ only for fractions/negatives/linear (session only)
  const prompt = promptOverride ?? (item ? buildItem(item.code, item.seed).prompt : '');

  useWakeLock(!!item && !disabled);

  // Start the per-item clock once the new item has actually painted and is
  // interactable — two rAFs after the item prop changes. Reset the entry.
  useEffect(() => {
    capturedRef.current = false;
    valueRef.current = '';
    setValue('');
    if (!item) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        startRef.current = performance.now();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [item?.code, item?.seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-arm the SAME item for a retry: clear the entry and accept input again, but
  // DON'T reset the clock — a retried item's interval spans the whole render→final
  // capture (the wrong attempt + the rethink), as decided (it's excluded from the
  // fluency rate anyway when tries>1). Guarded so it never fires on the first mount.
  const armedRef = useRef(armKey);
  useEffect(() => {
    if (armKey === armedRef.current) return;
    armedRef.current = armKey;
    capturedRef.current = false;
    valueRef.current = '';
    setValue('');
  }, [armKey]);

  const capture = useCallback(
    (given: string, idk = false) => {
      if (!item || capturedRef.current || disabled) return;
      if (!idk && given.trim() === '') return;
      capturedRef.current = true;
      const intervalMs = Math.max(0, Math.round(performance.now() - startRef.current));
      onCapture({ idemKey: newIdemKey(playerId), code: item.code, seed: item.seed, given: given.trim(), intervalMs, idk });
    },
    [item, disabled, playerId, onCapture],
  );

  const press = useCallback(
    (ch: string) => {
      if (!item || capturedRef.current || disabled) return;
      const nv = valueRef.current + ch;
      valueRef.current = nv;
      setValue(nv);
      // Sprint auto-submit: the tap that completes the expected digit count captures
      // immediately — no debounce, cleanest possible clock boundary.
      if (mode === 'sprint' && isAnswerComplete(nv, item.answerLength)) {
        capture(nv);
      }
    },
    [item, disabled, mode, capture],
  );

  const backspace = useCallback(() => {
    if (capturedRef.current || disabled) return;
    valueRef.current = valueRef.current.slice(0, -1);
    setValue(valueRef.current);
  }, [disabled]);

  const submit = useCallback(() => capture(valueRef.current), [capture]);

  // Desktop: physical keys feed the exact same input path as the pad.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!item || capturedRef.current || disabled) return;
      if (/^[0-9]$/.test(e.key)) {
        press(e.key);
        e.preventDefault();
      } else if ((e.key === '-' || e.key === '/') && allowSign) {
        press(e.key);
        e.preventDefault();
      } else if (e.key === 'Backspace') {
        backspace();
        e.preventDefault();
      } else if (e.key === 'Enter') {
        submit();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, disabled, allowSign, press, backspace, submit]);

  const keys = allowSign ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', '−', '0', '/'] : ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', null];

  return (
    <div className="input-stage">
      <div className="prompt">{renderPrompt(prompt)}</div>
      <div className="answer-display" aria-live="polite">
        {item?.family === 'linear' && <span className="answer-x">x =</span>}
        <span className="answer-value">{value || ' '}</span>
      </div>
      <div className="numpad" role="group" aria-label="sifferknappar">
        {keys.map((k, i) =>
          k == null ? (
            <span key={i} className="numpad-gap" aria-hidden />
          ) : (
            <button
              key={i}
              className="numpad-key"
              onClick={() => press(k === '−' ? '-' : k)}
              disabled={disabled || !item}
              type="button"
            >
              {k}
            </button>
          ),
        )}
        <button className="numpad-key numpad-back" onClick={backspace} disabled={disabled || !item} type="button" aria-label="sudda">
          ⌫
        </button>
        <button className="numpad-key numpad-ok" onClick={submit} disabled={disabled || !item || value.trim() === ''} type="button" aria-label="klar">
          ✓
        </button>
      </div>
      {showIdk && (
        // "vet inte" resolves the item without an answer — honesty costs nothing
        // (§3.1). Captured like any resolution so its clock still stops cleanly.
        <button className="softbtn" onClick={() => capture('', true)} disabled={disabled || !item} type="button">
          {idkLabel ?? 'vet inte'}
        </button>
      )}
    </div>
  );
}
