'use client';

import { useEffect, useRef, useState } from 'react';
import { postJSON } from '@/lib/client';
import { useI18n } from './LocaleProvider';

// Administers a probe (evidence-and-theses.md §2): the fixed items, one at a
// time, in the same screen and tone as practice — the child is not told it's a
// probe. Each response (correctness + latency) goes to /api/probe and nowhere
// near the model. One shot per item (a retry would muddy the measurement); quiet
// feedback only. Calls onDone when the set is finished.
type Item = { ref: string; prompt: string };

export function ProbeRun({
  playerId,
  probeSet,
  items,
  isBaseline,
  onDone,
}: {
  playerId: string;
  probeSet: string;
  items: Item[];
  isBaseline: boolean;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const shownAt = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    shownAt.current = Date.now();
    setValue('');
    inputRef.current?.focus();
  }, [i]);

  const item = items[i];
  if (!item) return <div className="stage" />;

  async function send(given: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      await postJSON('/api/probe', {
        playerId,
        probeSet,
        ref: item.ref,
        given,
        latencyMs: Math.max(0, Date.now() - shownAt.current),
        isBaseline,
      });
    } catch {
      /* a dropped probe is a missing row, not a failure — just move on */
    } finally {
      setBusy(false);
      if (i + 1 >= items.length) onDone();
      else setI(i + 1);
    }
  }

  return (
    <div className="stage">
      <div className="sessionbar-wrap" aria-label={`${i + 1}/${items.length}`}>
        <div className="sessionbar">
          <span style={{ width: `${Math.round(((i + 1) / items.length) * 100)}%` }} />
        </div>
        <div className="sessionbar-label">{i + 1}/{items.length}</div>
      </div>

      <div className="prompt">{item.prompt}</div>
      <div className="answer-row">
        <input
          ref={inputRef}
          className="answer-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9/-]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() !== '' && send(value.trim())}
          aria-label="svar"
        />
      </div>

      <div className="answer-actions">
        <button className="softbtn" onClick={() => send(null)}>{t('practice.dontKnow')}</button>
        <button className="submit-btn" onClick={() => send(value.trim())} disabled={value.trim() === ''} aria-label={t('pin.submit')}>
          ✓
        </button>
      </div>
    </div>
  );
}
