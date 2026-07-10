'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';
import { BY_KEY } from '@/icons';
import { useI18n } from '../_components/LocaleProvider';

type Item = { itemId: string; prompt: string; family: string; mode: string; level: number; novel: boolean };
type Session = { completed: number; target: number; done: boolean };
type AnswerResp = { status: 'retry' | 'correct' | 'revealed' | 'expired'; steps?: string[]; session?: Session; error?: string };
type Choice = { code: string; label: string; sample: string };

const QUIET_WORDS: Record<string, string[]> = {
  sv: ['Ja.', 'Rätt.', 'Bra.', 'Just det.', 'Precis.'],
  en: ['Yes.', 'Right.', 'Good.', "That's it.", 'Exactly.'],
};

function Practice() {
  const { t, locale } = useI18n();
  const QUIET = QUIET_WORDS[locale] ?? QUIET_WORDS.sv;
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
  const [icon, setIcon] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef(true);

  // Show whose session this is (their own icon) — identity, not a status badge.
  useEffect(() => {
    if (!playerId) return;
    getJSON<{ players?: { id: string; icon: string }[] }>('/api/me').then((me) => {
      const p = me.players?.find((x) => x.id === playerId);
      if (p) setIcon(BY_KEY.get(p.icon)?.glyph ?? null);
    });
  }, [playerId]);

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
        {icon && <div className="whoami" title={t('practice.you')}>{icon}</div>}
        <p className="muted" style={{ marginBottom: '2rem' }}>{t('practice.choosePrompt')}</p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {choices.map((c) => (
            <button key={c.code} className="choice-btn" onClick={() => load(c.code)}>
              <span className="choice-sample">{c.sample}</span>
              <span className="choice-label">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="stage">
        <div className="prompt" style={{ fontSize: '2rem' }}>{t('practice.done')}</div>
        <p className="muted">{t('practice.doneCount', { n: target })}</p>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
          <button className="next-btn" onClick={startSession}>{t('common.again')}</button>
          <a className="next-btn" href={`/shelf?p=${playerId}`}>{t('practice.cards')}</a>
          <a className="next-btn" href="/">{t('common.home')}</a>
        </div>
      </div>
    );
  }

  if (!item) return <div className="stage" />;

  return (
    <div className="stage">
      {icon && <div className="whoami" title={t('practice.you')}>{icon}</div>}
      <SessionBar completed={completed} target={target} />

      {/* reserved space so the equation never shifts when this appears */}
      <div className="novelty fade">{item.novel && phase === 'answer' ? t('practice.somethingNew') : ''}</div>

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

      <div className="quiet-word fade">{phase === 'correct' ? word : retry ? t('practice.tryAgain') : ''}</div>

      {phase === 'revealed' ? (
        <>
          <div className="solution">
            {steps.map((s, i) => (
              <div key={i} className="step" style={{ animationDelay: `${i * 320}ms` }}>{s}</div>
            ))}
          </div>
          <button className="next-btn" onClick={afterReveal}>{t('practice.next')}</button>
        </>
      ) : phase === 'answer' ? (
        <>
          <div className="answer-actions">
            <button className="softbtn" onClick={idk}>{t('practice.dontKnow')}</button>
            <button className="submit-btn" onClick={submit} disabled={value.trim() === ''} aria-label={t('pin.submit')}>
              ✓
            </button>
          </div>
          <button className="quit-btn" onClick={endEarly}>{t('practice.stop')}</button>
        </>
      ) : null}
    </div>
  );
}

// The one counter permitted on the practice screen (§3.1): a quiet grey bar that
// fills over the session's items. When it fills, the "Klart" screen appears.
function SessionBar({ completed, target }: { completed: number; target: number }) {
  const pct = Math.min(100, Math.round((completed / target) * 100));
  return (
    <div className="sessionbar-wrap" aria-label={`${completed} av ${target}`}>
      <div className="sessionbar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="sessionbar-label">{completed}/{target}</div>
    </div>
  );
}

// Every problem renders the same way — the equation on one line, one answer row
// beneath it — so nothing jumps between problems. A "□" prompt keeps the box in
// the equation as the blank; the child types the missing number in the row.
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
  // Render "□" as a clear, digit-sized blank ("?") rather than a tiny box.
  const promptEl = prompt.includes('□')
    ? prompt
        .split('□')
        .flatMap((part, i, arr) =>
          i < arr.length - 1 ? [part, <span key={i} className="blank-box">?</span>] : [part],
        )
    : prompt;

  return (
    <>
      <div className="prompt">{promptEl}</div>
      <div className="answer-row" style={{ visibility: show ? 'visible' : 'hidden' }}>
        {family === 'linear' && <span>x =</span>}
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
      </div>
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
