'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';
import { BY_KEY } from '@/icons';
import { CATS, ROSTER_BY_ID, type Target } from '@/reward/roster';
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
  const sp = useSearchParams();
  const playerId = sp.get('p') ?? '';
  const startCode = sp.get('start'); // arrive here from a frontier node on the map
  const [phase, setPhase] = useState<'loading' | 'choose' | 'answer' | 'correct' | 'revealed' | 'done'>('loading');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [target, setTarget] = useState(20);
  const [completed, setCompleted] = useState(0);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [ramp, setRamp] = useState(0); // warm-up items this session (onboarding-ramp)
  const [item, setItem] = useState<Item | null>(null);
  const [value, setValue] = useState('');
  const [retry, setRetry] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [icon, setIcon] = useState<string | null>(null);
  // The victory-lap offer (fluency-sprint-wiring §6): at most one skill, offered at
  // the peak moment (the done screen), throttled server-side to stay rare. null =
  // don't offer, which is the common case.
  const [offer, setOffer] = useState<{ code: string; label: string; family: string } | null>(null);
  const [offerDismissed, setOfferDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef(true);
  const autoStarted = useRef(false);

  // Show whose session this is (their own icon) — identity, not a status badge.
  useEffect(() => {
    if (!playerId) return;
    getJSON<{ players?: { id: string; icon: string }[] }>('/api/me').then((me) => {
      const p = me.players?.find((x) => x.id === playerId);
      if (p) setIcon(BY_KEY.get(p.icon)?.glyph ?? null);
    });
  }, [playerId]);

  const startSession = useCallback(async (again = false) => {
    const r = await postJSON<{ sessionId: number; target: number; choices: Choice[]; rampLen?: number; error?: string }>('/api/session/start', { playerId, again });
    if (r.error) return void (location.href = '/');
    autoStarted.current = false; // allow the ramp/start auto-load to fire for this session
    setRamp(r.rampLen ?? 0);
    setSessionId(r.sessionId);
    setTarget(r.target);
    setCompleted(0);
    setChoices(r.choices);
    firstRef.current = true;
    setPhase('choose');
  }, [playerId]);

  // Straight into a session. Nothing — no assessment, no measurement, no offer —
  // stands between a child and their first winnable problem. The child's first
  // experience belongs to the child, and it must be a win.
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

  // Skip the chooser and go straight into problems when either the child arrived
  // from a frontier node on the map (start=<skill>) or this session opens with a
  // warm-up ramp (onboarding-ramp §5 — the ramp is invisible, no mode, no choice).
  useEffect(() => {
    if (phase === 'choose' && sessionId != null && !autoStarted.current && (startCode || ramp > 0)) {
      autoStarted.current = true;
      load(startCode ?? undefined);
    }
  }, [phase, sessionId, startCode, ramp, load]);

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
    if (!item || busy || phase !== 'answer' || value.trim() === '') return;
    setBusy(true);
    try {
      const r = await postJSON<AnswerResp>('/api/answer', { playerId, sessionId, itemId: item.itemId, given: value.trim() });
      handle(r);
    } catch {
      // A network blip must not silently drop the answer or wedge the session:
      // keep the typed value and let them tap ✓ again. finally clears `busy`.
    } finally {
      setBusy(false);
    }
  }
  async function idk() {
    if (!item || busy || phase !== 'answer') return;
    setBusy(true);
    try {
      const r = await postJSON<AnswerResp>('/api/answer', { playerId, sessionId, itemId: item.itemId, idk: true });
      handle(r);
    } catch {
      /* keep state; user can retry */
    } finally {
      setBusy(false);
    }
  }
  // Ask for a victory-lap offer once the session is done — never before (nothing
  // stands between the child and the win). Logs 'sprint_offered' only when a card is
  // actually returned, so the throttle counts real offers.
  useEffect(() => {
    if (phase !== 'done' || !playerId) return;
    getJSON<{ offer: { code: string; label: string; family: string } | null }>(`/api/sprint/offer?playerId=${playerId}`).then((r) => {
      if (!r.offer) return;
      setOffer(r.offer);
      postJSON('/api/sprint/log', { playerId, event: 'offered', skill: r.offer.code });
    });
  }, [phase, playerId]);

  function declineOffer() {
    if (offer) postJSON('/api/sprint/log', { playerId, event: 'declined', skill: offer.code });
    setOfferDismissed(true);
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
    if (startCode || ramp > 0) return <div className="stage" />; // auto-starting (map link or warm-up); don't flash the chooser
    return (
      <div className="stage">
        {icon && <div className="whoami" title={t('practice.you')}>{icon}</div>}
        <p className="muted" style={{ marginBottom: '2rem' }}>{t('practice.choosePrompt')}</p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {choices.map((c) => (
            <button key={c.code} className="choice-btn" onClick={() => load(c.code)}>
              <span className="choice-sample">{renderPrompt(c.sample)}</span>
              <span className="choice-label">{c.label}</span>
            </button>
          ))}
        </div>
        {/* The map/cards, reachable any time — not only just after a session ends
            (add-map-icon-title §1). A quiet secondary link: the choice buttons
            above are the primary action, this is a look-back/look-ahead glance. */}
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <a className="quit-btn" href={`/shelf?p=${playerId}`}>🗺️ {t('practice.cards')}</a>
          <a className="quit-btn" href="/">🏠 {t('common.home')}</a>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="stage">
        <div className="prompt" style={{ fontSize: '2rem' }}>{t('practice.done')}</div>
        {/* completion-in-the-moment: today counts, said on the child's own end
            screen where no sibling stands — not a badge carried on the menu */}
        <div className="done-today">
          <span className="day-dot on today" />
          {t('practice.doneToday')}
        </div>
        <p className="muted">{t('practice.doneCount', { n: target })}</p>
        {sessionId != null && <SessionAllocation sessionId={sessionId} />}
        {/* Victory lap — offered here, at the peak, never before and never forced.
            A single warm invitation the child can wave off ("inte nu"), not a gate. */}
        {offer && !offerDismissed && (
          <div className="sprint-offer">
            <p>{t('sprint.offerLine', { skill: offer.label })}</p>
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
              <a className="next-btn primary" href={`/sprint?p=${playerId}&start=${encodeURIComponent(offer.code)}&go=1`}>⚡ {t('sprint.offerGo')}</a>
              <button className="next-btn" onClick={declineOffer}>{t('sprint.offerLater')}</button>
            </div>
          </div>
        )}
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.8rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="next-btn" onClick={() => startSession(true)}>{t('common.again')}</button>
          <a className="next-btn" href={`/room?p=${playerId}`}>🐱 {t('room.title')}</a>
          {/* back to the family screen — where the kids see their icons again */}
          <a className="next-btn primary" href="/">🏠 {t('common.home')}</a>
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
        inputRef={inputRef}
        onChange={setValue}
        onSubmit={submit}
        canSubmit={value.trim() !== ''}
        showSubmit={phase === 'answer'}
        submitLabel={t('pin.submit')}
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
          {/* "vet inte" sits right under the input row (which the keyboard scrolls
              into view), so it stays reachable above the keyboard on mobile. */}
          <button className="softbtn" onClick={idk}>{t('practice.dontKnow')}</button>
          {/* leaving mid-session ends it and returns to the family screen */}
          <button className="quit-btn" onClick={endEarly}>🏠 {t('common.home')}</button>
        </>
      ) : null}
    </div>
  );
}

// The one counter permitted on the practice screen (§3.1): a quiet grey bar that
// fills over the session's items. The label counts DOWN — how many are left — so
// a child reads "3" (almost done), not "17/20" (arithmetic on the ceiling).
function SessionBar({ completed, target }: { completed: number; target: number }) {
  const { t } = useI18n();
  const pct = Math.min(100, Math.round((completed / target) * 100));
  const left = Math.max(0, target - completed);
  return (
    <div className="sessionbar-wrap" aria-label={t('practice.left', { n: left })}>
      <div className="sessionbar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="sessionbar-label">{t('practice.left', { n: left })}</div>
    </div>
  );
}

// Render "□" as a clear, digit-sized blank ("?") rather than a tiny box. Shared
// by the problem prompt and the session-start choice samples so both read alike.
function renderPrompt(prompt: string): React.ReactNode {
  if (!prompt.includes('□')) return prompt;
  return prompt
    .split('□')
    .flatMap((part, i, arr) => (i < arr.length - 1 ? [part, <span key={i} className="blank-box">?</span>] : [part]));
}

// Families whose answers can be negative or a fraction need the full keyboard
// (for "-" and "/"); the rest get a digit-only numeric keypad on mobile.
function inputModeFor(family: string): 'numeric' | 'text' {
  return family === 'fractions' || family === 'negatives' || family === 'linear' ? 'text' : 'numeric';
}

// Every problem renders the same way — the equation on one line, one answer row
// beneath it — so nothing jumps between problems. A "□" prompt keeps the box in
// the equation as the blank; the child types the missing number in the row.
function Problem({
  prompt,
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
  prompt: string;
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
    <>
      <div className="prompt">{renderPrompt(prompt)}</div>
      <div className="answer-row" style={{ visibility: show ? 'visible' : 'hidden' }}>
        {family === 'linear' && <span>x =</span>}
        {/* Never `disabled` between items: disabling dismisses the mobile keyboard,
            and the OS then re-opens the DEFAULT keyboard on the programmatic
            refocus, ignoring inputMode. Keeping it enabled holds the numeric pad
            across the whole session. Typing during the 800ms reveal is harmless —
            submit is guarded by phase and the value resets on the next item. */}
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
    </>
  );
}

// End-of-session allocation (celerant-cat-collection-spec.md §UI). The session was
// already auto-directed to the family's shared target; this is the one-tap confirm
// (pre-selected) with the option to redirect it — to another cat or the family
// goal. Frictionless for the youngest: doing nothing keeps the default.
type RewardData = { progress: Record<string, number>; unlockedCats: string[]; sharedTarget: Target; familyGoalOpen: boolean; familyGoalLabel: string | null };
function SessionAllocation({ sessionId }: { sessionId: number }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<RewardData | null>(null);
  const [chosen, setChosen] = useState<Target | null>(null);

  useEffect(() => {
    getJSON<RewardData>('/api/reward').then((d) => {
      setData(d);
      setChosen(d.sharedTarget);
    });
  }, []);

  async function pick(target: Target) {
    setChosen(target);
    const r = await postJSON<{ reward?: RewardData }>('/api/reward/allocate', { sessionId, target });
    if (r.reward) setData(r.reward);
  }

  if (!data || !chosen) return null;
  // offer: the unresolved cats (a few, in order) + the family goal
  const cats = CATS.filter((c) => !data.unlockedCats.includes(c.id)).slice(0, 4);
  const label = (target: Target) => (target.kind === 'family' ? data.familyGoalLabel ?? t('room.familyGoal') : ROSTER_BY_ID.get(target.id)?.name[locale] ?? target.id);
  const same = (a: Target, b: Target) => a.kind === b.kind && a.id === b.id;
  const chosenCount = chosen.kind === 'cat' ? `${data.progress[chosen.id] ?? 0}/${ROSTER_BY_ID.get(chosen.id)?.cost ?? 20}` : `${data.progress['family'] ?? 0}`;

  return (
    <div className="alloc-box">
      <div className="alloc-head">{t('reward.countsToward')} <span className="alloc-current">{label(chosen)}</span> — {chosenCount}</div>
      <div className="alloc-choices">
        {cats.map((c) => {
          const tgt: Target = { kind: 'cat', id: c.id };
          return (
            <button key={c.id} className={`alloc-chip ${same(chosen, tgt) ? 'on' : ''}`} onClick={() => pick(tgt)}>
              <span className="cat-face" style={{ width: 20, height: 20, backgroundImage: `url(/cats/${c.id}/idle.png)`, backgroundSize: '140px 20px' }} aria-hidden /> {c.name[locale]}
            </button>
          );
        })}
        {/* the family goal is a spend option ONLY while it exists and is unreached,
            and it wears the goal's OWN name (e.g. "simhallen"), not a generic label */}
        {data.familyGoalOpen && (
          <button className={`alloc-chip ${chosen.kind === 'family' ? 'on' : ''}`} onClick={() => pick({ kind: 'family', id: 'family' })}>
            🎯 {data.familyGoalLabel ?? t('room.familyGoal')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="stage" />}>
      <Practice />
    </Suspense>
  );
}
