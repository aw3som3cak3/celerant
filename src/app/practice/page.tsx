'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { postJSON } from '@/lib/client';

type Item = { itemId: string; prompt: string; family: string; mode: string; level: number; novel: boolean };
type Session = { completed: number; target: number; done: boolean };
type AnswerResp = { status: 'retry' | 'correct' | 'revealed' | 'expired'; steps?: string[]; session?: Session; error?: string };
type Choice = { code: string; label: string };

const QUIET = ['Ja.', 'Rätt.', 'Bra.', 'Just det.', 'Precis.'];

function Practice() {
  const playerId = useSearchParams().get('p') ?? '';
  const [phase, setPhase] = useState<'loading' | 'choose' | 'answer' | 'correct' | 'revealed' | 'done'>('loading');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [target, setTarget] = useState(20);
  const [completed, setCompleted] = useState(0);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [item, setItem] = useState<Item | null>(null);
  const [value, setValue] = useState('');
  const [retry, setRetry] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef(true);

  const startSession = useCallback(async () => {
    const r = await postJSON<{ sessionId: number; target: number; choices: Choice[]; error?: string }>('/api/session/start', { playerId });
    if (r.error) return void (location.href = '/');
    setSessionId(r.sessionId);
    setTarget(r.target);
    setCompleted(0);
    setChoices(r.choices);
    firstRef.current = true;
    setPhase('choose');
  }, [playerId]);

  useEffect(() => {
    if (!playerId) return void (location.href = '/');
    startSession();
  }, [playerId, startSession]);

  const load = useCallback(
    async (chosenCode?: string) => {
      setValue('');
      setRetry(false);
      setSteps([]);
      setWord('');
      const body: Record<string, unknown> = { playerId, sessionId };
      if (chosenCode) body.chosenCode = chosenCode;
      const next = await postJSON<Item & { error?: string }>('/api/next', body);
      if (next.error) return void (location.href = '/');
      setItem(next);
      setPhase('answer');
    },
    [playerId, sessionId],
  );

  useEffect(() => {
    if (phase === 'answer') inputRef.current?.focus();
  }, [phase, item]);

  function handle(r: AnswerResp) {
    if (r.status === 'expired' || r.error) return void load();
    if (r.status === 'retry') {
      setRetry(true);
      setValue('');
      inputRef.current?.focus();
      return;
    }
    if (r.session) setCompleted(r.session.completed);
    const done = r.session?.done ?? false;
    if (r.status === 'correct') {
      setWord(QUIET[Math.floor(Math.random() * QUIET.length)]);
      setPhase('correct');
      setTimeout(() => (done ? setPhase('done') : load()), 800);
      return;
    }
    setSteps(r.steps ?? []);
    setPhase('revealed');
    if (done) {
      // reveal stays; the "Nästa" button will show the done screen
    }
  }

  async function submit() {
    if (!item || busy || value.trim() === '') return;
    setBusy(true);
    const r = await postJSON<AnswerResp>('/api/answer', { playerId, sessionId, itemId: item.itemId, given: value.trim() });
    setBusy(false);
    handle(r);
  }
  async function idk() {
    if (!item || busy) return;
    setBusy(true);
    const r = await postJSON<AnswerResp>('/api/answer', { playerId, sessionId, itemId: item.itemId, idk: true });
    setBusy(false);
    handle(r);
  }
  function afterReveal() {
    if (completed >= target) setPhase('done');
    else load();
  }
  async function endEarly() {
    await postJSON('/api/session/end', { playerId, sessionId });
    location.href = '/';
  }

  if (phase === 'loading') return <div className="stage" />;

  if (phase === 'choose') {
    return (
      <div className="stage">
        <p className="muted" style={{ marginBottom: '2rem' }}>Vad vill du börja med?</p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {choices.map((c) => (
            <button key={c.code} className="next-btn" style={{ fontSize: '1.2rem', padding: '1rem 1.4rem' }} onClick={() => load(c.code)}>
              {c.label}
            </button>
          ))}
        </div>
        <Counter completed={completed} target={target} />
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="stage">
        <div className="prompt" style={{ fontSize: '2rem' }}>Klart.</div>
        <p className="muted">{target} problem.</p>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
          <button className="next-btn" onClick={startSession}>Igen</button>
          <a className="next-btn" href={`/shelf?p=${playerId}`}>Korten</a>
          <a className="next-btn" href="/">Hem</a>
        </div>
      </div>
    );
  }

  if (!item) return <div className="stage" />;

  return (
    <div className="stage">
      {item.novel && phase === 'answer' && <div className="muted fade" style={{ marginBottom: '0.8rem' }}>Något nytt.</div>}

      <Problem
        prompt={item.prompt}
        family={item.family}
        show={phase !== 'revealed'}
        value={value}
        disabled={phase === 'correct'}
        inputRef={inputRef}
        onChange={setValue}
        onEnter={submit}
      />

      <div className="quiet-word fade">{phase === 'correct' ? word : retry ? 'Prova en gång till.' : ''}</div>

      {phase === 'revealed' && (
        <>
          <div className="solution">
            {steps.map((s, i) => (
              <div key={i} className="step" style={{ animationDelay: `${i * 320}ms` }}>{s}</div>
            ))}
          </div>
          <button className="next-btn" onClick={afterReveal}>Nästa</button>
        </>
      )}

      {phase === 'answer' && (
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <button className="idk" onClick={idk}>vet inte</button>
          <button className="idk" onClick={endEarly}>sluta</button>
        </div>
      )}

      <Counter completed={completed} target={target} />
      <div className="level" aria-hidden>
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className={`tick ${i < item.level ? 'on' : ''}`} />
        ))}
      </div>
    </div>
  );
}

// The one counter permitted on the practice screen (§3.1): items remaining.
function Counter({ completed, target }: { completed: number; target: number }) {
  return (
    <div style={{ position: 'fixed', top: '1rem', color: 'var(--faint)', fontVariantNumeric: 'tabular-nums' }}>
      {completed}/{target}
    </div>
  );
}

// Renders the problem. For a "□" prompt (missing number) the answer input sits
// inline where the box was — never a box glyph AND a separate input.
function Problem({
  prompt,
  family,
  show,
  value,
  disabled,
  inputRef,
  onChange,
  onEnter,
}: {
  prompt: string;
  family: string;
  show: boolean;
  value: string;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  const input = (
    <input
      ref={inputRef}
      className="answer-input"
      autoComplete="off"
      spellCheck={false}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter()}
      aria-label="svar"
    />
  );

  if (prompt.includes('□')) {
    const [before, after] = prompt.split('□');
    return (
      <div className="prompt" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <span>{before}</span>
        {show ? input : <span>▁</span>}
        <span>{after}</span>
      </div>
    );
  }

  return (
    <>
      <div className="prompt">{prompt}</div>
      {show && (
        <div className="answer-row">
          {family === 'linear' && <span>x =</span>}
          {input}
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="stage" />}>
      <Practice />
    </Suspense>
  );
}
