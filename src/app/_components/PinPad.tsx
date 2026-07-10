'use client';

import { useState } from 'react';

// A numeric pad — never a text field on a child's screen. Calls onComplete when
// four digits are entered.
export function PinPad({ onComplete, label }: { onComplete: (pin: string) => void; label?: string }) {
  const [pin, setPin] = useState('');

  function push(d: string) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      onComplete(next);
      setTimeout(() => setPin(''), 150);
    }
  }

  return (
    <div>
      {label && <p className="muted" style={{ textAlign: 'center' }}>{label}</p>}
      <div className="pindots">{'•'.repeat(pin.length)}{'◦'.repeat(4 - pin.length)}</div>
      <div className="pinpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className="pinkey" onClick={() => push(d)}>
            {d}
          </button>
        ))}
        <button className="pinkey" style={{ visibility: 'hidden' }} disabled />
        <button className="pinkey" onClick={() => push('0')}>
          0
        </button>
        <button className="pinkey" onClick={() => setPin((p) => p.slice(0, -1))}>
          ←
        </button>
      </div>
    </div>
  );
}
