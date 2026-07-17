'use client';

import React from 'react';

// Families whose answers can be negative or a fraction need the full keyboard
// (for "-" and "/"); the rest get a digit-only numeric keypad on mobile.
export function inputModeFor(family: string): 'numeric' | 'text' {
  return family === 'fractions' || family === 'negatives' || family === 'linear' ? 'text' : 'numeric';
}

// The child's answer row — the ONE place an answer is typed and submitted, shared
// by BOTH practice and the sprint so the two can never drift apart on mobile again.
//
// The sprint bug (bug-hunt-fluency follow-up) was exactly this drift: the sprint
// had its own inline input that never inherited practice's mobile fix, so on a
// tablet an answer could be typed but never submitted — a numeric keypad has no
// Enter key and the sprint had no ✓ button, so nothing was ever POSTed, correct/
// errors stayed 0, and the run finalized empty. Making practice and the sprint the
// SAME component is the structural fix: whatever makes practice submittable on a
// pad, the sprint now has by construction.
//
// Two mobile subtleties baked in here, learned from practice:
//  - Submission is the ✓ button (Enter still works on a physical keyboard), because
//    the numeric soft keypad has no Enter/return key.
//  - The input is never `disabled` between items: disabling dismisses the mobile
//    keyboard, and the OS then reopens the DEFAULT keyboard on the programmatic
//    refocus, ignoring inputMode. So we keep it enabled and gate submit by state.
export function AnswerInput({
  family,
  show,
  value,
  inputRef,
  onChange,
  onSubmit,
  canSubmit,
  showSubmit,
  submitLabel,
}: {
  family: string;
  show: boolean;
  value: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (v: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  showSubmit: boolean;
  submitLabel: string;
}) {
  const mode = inputModeFor(family);
  return (
    <div className="answer-row" style={{ visibility: show ? 'visible' : 'hidden' }}>
      {family === 'linear' && <span>x =</span>}
      <input
        ref={inputRef}
        className="answer-input"
        type="text"
        inputMode={mode}
        pattern={mode === 'numeric' ? '[0-9]*' : undefined}
        autoComplete="off"
        spellCheck={false}
        value={value}
        // Only digits, and "-"/"/" for negatives and fractions — never letters.
        onChange={(e) => onChange(e.target.value.replace(/[^0-9/-]/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        aria-label="svar"
      />
      {/* Inline with the input so it's always above the keyboard — a numeric
          keypad has no Enter key, so the child taps ✓ (onboarding/mobile fix). */}
      <button
        className="submit-btn"
        onClick={onSubmit}
        disabled={!canSubmit}
        aria-label={submitLabel}
        style={{ visibility: showSubmit ? 'visible' : 'hidden' }}
      >
        ✓
      </button>
    </div>
  );
}
