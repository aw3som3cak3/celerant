'use client';

import { useEffect, useState } from 'react';
import { useI18n } from './LocaleProvider';

// A numeric pad — never a text field on a child's screen. Also accepts the
// physical keyboard/numpad (digits, Backspace, Enter). Submit is explicit, via
// the OK button or Enter, so a confirm-twice flow is not surprising.
export function PinPad({ onComplete, label }: { onComplete: (pin: string) => void; label?: string }) {
  const { t } = useI18n();
  const [pin, setPin] = useState('');

  const add = (d: string) => setPin((p) => (p.length < 4 ? p + d : p));
  const del = () => setPin((p) => p.slice(0, -1));
  const submit = () => {
    if (pin.length === 4) {
      onComplete(pin);
      setPin('');
    }
  };

  // Physical keyboard / numpad. Re-registered each render so `submit` sees the
  // current pin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        add(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        del();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div>
      {label && <p className="muted" style={{ textAlign: 'center' }}>{label}</p>}
      <div className="pindots">{'•'.repeat(pin.length)}{'◦'.repeat(4 - pin.length)}</div>
      <div className="pinpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className="pinkey" onClick={() => add(d)}>
            {d}
          </button>
        ))}
        <button className="pinkey" onClick={del} aria-label="backspace">
          ←
        </button>
        <button className="pinkey" onClick={() => add('0')}>
          0
        </button>
        <button className="pinkey submit" onClick={submit} disabled={pin.length !== 4} aria-label={t('pin.submit')}>
          ✓
        </button>
      </div>
    </div>
  );
}
