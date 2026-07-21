'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';
import { EmojiIcon } from '../_components/Icon';
import { CATS, ROSTER_BY_ID, type Target } from '@/reward/roster';
import { useI18n } from '../_components/LocaleProvider';
import { InputStage, type StageItem, type Captured } from '../_components/InputStage';
import { enqueueAnswer, ackAnswers, pendingAnswers } from '../_components/answerQueue';
import { buildItem } from '@/lib/item';

// The item the SERVER issues for the client to build locally (input-timing A4).
type Item = { code: string; seed: number; family: string; answerLength: number; novel: boolean; level: number; warmup: boolean };
type Session = { completed: number; target: number; done: boolean };
type AnswerResp =
  | { status: 'retry' }
  | { status: 'correct' | 'revealed'; steps?: string[]; session?: Session; next: Item | null };
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
  const [target, setTarget] = useState(10);
  const [completed, setCompleted] = useState(0);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [ramp, setRamp] = useState(0);
  const [item, setItem] = useState<Item | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [word, setWord] = useState('');
  const [retry, setRetry] = useState(false);
  const [armKey, setArmKey] = useState(0); // bump to re-arm InputStage for a retry
  const [busy, setBusy] = useState(false);
  const [icon, setIcon] = useState<string | null>(null);
  const [hasDiplomas, setHasDiplomas] = useState(false);
  const [offer, setOffer] = useState<{ code: string; label: string; family: string } | null>(null);
  const [offerDismissed, setOfferDismissed] = useState(false);
  const triesRef = useRef(1); // client-tracked try count for the CURRENT item (1, then 2 on a retry)
  const autoStarted = useRef(false);
  const resumingRef = useRef(false);

  // Show whose session this is (their own icon).
  useEffect(() => {
    if (!playerId) return;
    getJSON<{ players?: { id: string; icon: string; hasDiplomas?: boolean }[] }>('/api/me').then((me) => {
      const p = me.players?.find((x) => x.id === playerId);
      if (p) {
        setIcon(p.icon); // store the KEY; the 3D image is rendered by EmojiIcon
        setHasDiplomas(!!p.hasDiplomas);
      }
    });
  }, [playerId]);

  // Flush any answers a previous tab close left in the durable queue (idempotent on
  // the server via idemKey), so an interrupted session's last answer is never lost.
  useEffect(() => {
    if (!playerId) return;
    const stuck = pendingAnswers('session').filter((a) => a.playerId === playerId);
    for (const a of stuck) {
      postJSON('/api/session/answer', { playerId, sessionId: Number(a.context), code: a.code, seed: a.seed, given: a.given, idk: a.given === null, tries: a.tries, intervalMs: a.intervalMs, idemKey: a.idemKey })
        .then(() => ackAnswers([a.idemKey]))
        .catch(() => {});
    }
  }, [playerId]);

  const revealNextRef = useRef<Item | null>(null);

  const firstItem = useCallback(
    async (chosenCode?: string) => {
      setSteps([]);
      setWord('');
      setRetry(false);
      triesRef.current = 1;
      const r = await postJSON<{ item?: Item; error?: string }>('/api/session/item', { playerId, sessionId, chosenCode });
      if (r.error || !r.item) return void (location.href = '/');
      setItem(r.item);
      setPhase('answer');
    },
    [playerId, sessionId],
  );

  const startSession = useCallback(async (again = false) => {
    const r = await postJSON<{ sessionId: number; target: number; choices: Choice[]; rampLen?: number; error?: string }>('/api/session/start', { playerId, again });
    if (r.error) return void (location.href = '/');
    autoStarted.current = false;
    resumingRef.current = false;
    setRamp(r.rampLen ?? 0);
    setSessionId(r.sessionId);
    setTarget(r.target);
    setCompleted(0);
    setChoices(r.choices);
    setPhase('choose');
  }, [playerId]);

  const resumeOrStart = useCallback(async () => {
    const cur = await getJSON<{ session?: { id: number; target: number; completed: number } | null }>(`/api/session/current?playerId=${playerId}`);
    if (cur.session) {
      autoStarted.current = false;
      resumingRef.current = true;
      setSessionId(cur.session.id);
      setTarget(cur.session.target);
      setCompleted(cur.session.completed);
      setRamp(0);
      setChoices([]);
      setPhase('choose'); // blank; the auto-load effect loads the next item
    } else {
      startSession();
    }
  }, [playerId, startSession]);

  useEffect(() => {
    if (!playerId) return void (location.href = '/');
    resumeOrStart();
  }, [playerId, resumeOrStart]);

  // Auto-load the first problem (map link, warm-up ramp, or resume) without flashing
  // the chooser.
  useEffect(() => {
    if (phase === 'choose' && sessionId != null && !autoStarted.current && (startCode || ramp > 0 || resumingRef.current)) {
      autoStarted.current = true;
      firstItem(startCode ?? undefined);
    }
  }, [phase, sessionId, startCode, ramp, firstItem]);

  // Interruption guard (input-timing #3): if the pad was backgrounded long enough
  // while a problem was open, its client-measured interval is contaminated — discard
  // it and serve a fresh item (the selector picks the next), so a broken interval
  // never becomes the child's recorded latency. rate.ts also excludes >60s intervals
  // as a backstop.
  const hiddenAtRef = useRef<number | null>(null);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt != null && Date.now() - hiddenAt > 30_000 && phase === 'answer' && item && !busy) firstItem();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [phase, item, busy, firstItem]);

  const advance = useCallback((next: Item | null) => {
    setSteps([]);
    setWord('');
    setRetry(false);
    triesRef.current = 1;
    if (next) {
      setItem(next);
      setPhase('answer');
    } else {
      setPhase('done');
    }
  }, []);

  const onCapture = useCallback(
    async (c: Captured) => {
      if (busy || !item || sessionId == null) return;
      setBusy(true);
      const given = c.idk ? null : c.given;
      // Durable-first: persist before the network so a tab close can't lose it; the
      // server dedups on idemKey, so a later re-send never double-counts.
      enqueueAnswer({ idemKey: c.idemKey, playerId, kind: 'session', context: String(sessionId), code: c.code, seed: c.seed, given, tries: triesRef.current, intervalMs: c.intervalMs, ts: Date.now() });
      try {
        const r = await postJSON<AnswerResp>('/api/session/answer', {
          playerId, sessionId, code: c.code, seed: c.seed, given, idk: c.idk, tries: triesRef.current, warmup: item.warmup, intervalMs: c.intervalMs, idemKey: c.idemKey,
        });
        ackAnswers([c.idemKey]); // the server processed it (recorded or a retry) — clear it
        if (r.status === 'retry') {
          triesRef.current = 2;
          setRetry(true);
          setArmKey((k) => k + 1); // re-arm InputStage for the second try (same item, clock kept)
        } else if (r.status === 'correct') {
          if (r.session) setCompleted(r.session.completed);
          setWord(QUIET[Math.floor(Math.random() * QUIET.length)]);
          setPhase('correct');
          const done = r.session?.done ?? false;
          setTimeout(() => (done ? setPhase('done') : advance(r.next)), 800);
        } else {
          if (r.session) setCompleted(r.session.completed);
          setSteps(r.steps ?? []);
          setPhase('revealed');
          // the "Nästa" button advances to r.next (or the done screen)
          revealNextRef.current = r.session?.done ? null : r.next;
        }
      } catch {
        // Network blip: the answer is durably queued (flushed on next mount). Re-arm
        // so the child can re-submit; idempotency makes a double never double-count.
        setArmKey((k) => k + 1);
      } finally {
        setBusy(false);
      }
    },
    [busy, item, sessionId, playerId, QUIET, advance],
  );

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

  async function endEarly() {
    await postJSON('/api/session/end', { playerId, sessionId });
    location.href = '/';
  }

  if (phase === 'loading') return <div className="stage" />;

  if (phase === 'choose') {
    if (startCode || ramp > 0 || resumingRef.current) return <div className="stage" />;
    return (
      <div className="stage">
        {icon && <div className="whoami" title={t('practice.you')}><EmojiIcon iconKey={icon} /></div>}
        <p className="muted" style={{ marginBottom: '2rem' }}>{t('practice.choosePrompt')}</p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {choices.map((c) => (
            <button key={c.code} className="choice-btn" onClick={() => firstItem(c.code)}>
              <span className="choice-sample">{renderPrompt(c.sample)}</span>
              <span className="choice-label">{c.label}</span>
            </button>
          ))}
        </div>
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
        <div className="done-today">
          <span className="day-dot on today" />
          {t('practice.doneToday')}
        </div>
        <p className="muted">{t('practice.doneCount', { n: target })}</p>
        {sessionId != null && <SessionAllocation sessionId={sessionId} />}
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
          {hasDiplomas && <a className="next-btn" href={`/shelf?p=${playerId}`}>🏅 {t('home.diplomas')}</a>}
          <a className="next-btn" href={`/room?p=${playerId}`}>🐱 {t('room.title')}</a>
          <a className="next-btn primary" href="/">🏠 {t('common.home')}</a>
        </div>
      </div>
    );
  }

  if (!item) return <div className="stage" />;

  return (
    <div className="stage">
      {icon && <div className="whoami" title={t('practice.you')}><EmojiIcon iconKey={icon} /></div>}
      <SessionBar completed={completed} target={target} />

      <div className="novelty fade">{item.novel && phase === 'answer' ? t('practice.somethingNew') : ''}</div>

      {phase === 'revealed' ? (
        <>
          <div className="prompt">{renderPrompt(buildItemPrompt(item))}</div>
          <div className="solution">
            {steps.map((s, i) => (
              <div key={i} className="step" style={{ animationDelay: `${i * 320}ms` }}>{s}</div>
            ))}
          </div>
          <button className="next-btn" onClick={() => advance(revealNextRef.current)}>{t('practice.next')}</button>
        </>
      ) : (
        <>
          <InputStage
            mode="session"
            item={{ code: item.code, seed: item.seed, family: item.family, answerLength: item.answerLength } as StageItem}
            playerId={playerId}
            onCapture={onCapture}
            disabled={busy || phase === 'correct'}
            showIdk
            idkLabel={t('practice.dontKnow')}
            armKey={armKey}
          />
          <div className="quiet-word fade">{phase === 'correct' ? word : retry ? t('practice.tryAgain') : ''}</div>
          <button className="quit-btn" onClick={endEarly}>🏠 {t('common.home')}</button>
        </>
      )}
    </div>
  );
}

// Build the prompt for the reveal screen (the numpad is gone there), from the same
// shared generator the server graded against.
function buildItemPrompt(item: { code: string; seed: number }): string {
  return buildItem(item.code, item.seed).prompt;
}

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

function renderPrompt(prompt: string): React.ReactNode {
  if (!prompt.includes('□')) return prompt;
  return prompt
    .split('□')
    .flatMap((part, i, arr) => (i < arr.length - 1 ? [part, <span key={i} className="blank-box">?</span>] : [part]));
}

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
  const cats = CATS.filter((c) => !data.unlockedCats.includes(c.id)).slice(0, 4);
  const label = (target: Target) => (target.kind === 'family' ? data.familyGoalLabel ?? t('room.familyGoal') : ROSTER_BY_ID.get(target.id)?.name[locale] ?? target.id);
  const same = (a: Target, b: Target) => a.kind === b.kind && a.id === b.id;
  const chosenCount = chosen.kind === 'cat' ? `${data.progress[chosen.id] ?? 0}/${ROSTER_BY_ID.get(chosen.id)?.cost ?? 40}` : `${data.progress['family'] ?? 0}`;

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
