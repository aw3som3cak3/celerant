'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';
import { EmojiIcon } from '../_components/Icon';
import { Emoji } from '../_components/Emoji';
import { CATS, ROSTER_BY_ID, type Target } from '@/reward/roster';
import { useI18n } from '../_components/LocaleProvider';
import { InputStage, type StageItem, type Captured } from '../_components/InputStage';
import { AcquisitionStage } from '../_components/AcquisitionStage';
import { type StrategyId } from '@/lib/acquisition-content';
import { ChoiceStage } from '../_components/ChoiceStage';
import { newIdemKey } from '../_components/answerQueue';
import { enqueueAnswer, ackAnswers, pendingAnswers } from '../_components/answerQueue';
import { deviceEnvJson } from '../_components/deviceEnv';
import { buildItem } from '@/lib/item';
import { makeRng } from '@/lib/rng';
import { SPELLING_LETTERS, spellingAudio } from '@/lib/spelling-content';
import { ENGLISH_LETTERS } from '@/lib/english-content';

// The item the SERVER issues for the client to build locally (input-timing A4).
type Item = { code: string; seed: number; family: string; answerLength: number; novel: boolean; level: number; warmup: boolean; burst?: boolean;
  // SCAFFOLDED ACQUISITION: present ⇒ render the faded derivation at this level instead of the
  // bare fact (the client rebuilds it from code+seed+strategy; the answer never crosses the wire).
  acq?: { level: number; strategy: StrategyId } };
type Session = { completed: number; target: number; done: boolean };
type AnswerResp =
  | { status: 'retry' }
  | { status: 'correct' | 'revealed'; steps?: string[]; session?: Session; next: Item | null; diplomas?: string[] };
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
  const subjectParam = sp.get('subject'); // explicit single-subject entry; null = the mixed Öva
  const subject = subjectParam === 'spelling' ? 'spelling' : subjectParam === 'english' ? 'english' : 'maths';
  const startCode = sp.get('start'); // arrive here from a frontier node on the map
  const [phase, setPhase] = useState<'loading' | 'headphones' | 'choose' | 'answer' | 'correct' | 'revealed' | 'done'>('loading');
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
  const [diplomas, setDiplomas] = useState<string[]>([]); // diplomas earned via a burst this session (WS III B1)
  const triesRef = useRef(1); // client-tracked try count for the CURRENT item (1, then 2 on a retry)
  const autoStarted = useRef(false);
  const resumingRef = useRef(false);
  const againRef = useRef(false); // carry the "en till?" intent through the headphone prompt
  const [spellingAvailable, setSpellingAvailable] = useState(false);

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

  const startSession = useCallback(async (again = false, headphones?: boolean) => {
    // A mixed Öva sends the headphone answer (spelling joins only with headphones); an explicit
    // subject entry (map deep-link) sends the subject and stays single-subject.
    const body = subjectParam ? { playerId, again, subject } : { playerId, again, headphones };
    const r = await postJSON<{ sessionId: number; target: number; choices: Choice[]; rampLen?: number; error?: string }>('/api/session/start', body);
    if (r.error) return void (location.href = '/');
    againRef.current = false;
    autoStarted.current = false;
    resumingRef.current = false;
    setRamp(r.rampLen ?? 0);
    setSessionId(r.sessionId);
    setTarget(r.target);
    setCompleted(0);
    setChoices(r.choices);
    setPhase('choose');
  }, [playerId, subject, subjectParam]);

  // "En till?" restart: for a mixed Öva, re-ask headphones (once per pass); else start directly.
  const restart = useCallback(() => {
    if (spellingAvailable && !subjectParam && !startCode) {
      againRef.current = true;
      setPhase('headphones');
    } else {
      startSession(true);
    }
  }, [spellingAvailable, subjectParam, startCode, startSession]);

  const resumeOrStart = useCallback(async () => {
    const [cur, me] = await Promise.all([
      getJSON<{ session?: { id: number; target: number; completed: number } | null }>(`/api/session/current?playerId=${playerId}`),
      getJSON<{ spelling?: boolean; players?: { id: string; schoolYear: number }[] }>('/api/me'),
    ]);
    // Spelling is offered to every child now (the ladder + band gate the tier, not årskurs); the
    // headphone prompt shows whenever spelling is available for the family.
    const meP = me.players?.find((p) => p.id === playerId);
    const ready = !!me.spelling && !!meP;
    setSpellingAvailable(ready); // in both paths, so a later "en till" re-asks headphones
    if (cur.session) {
      autoStarted.current = false;
      resumingRef.current = true;
      setSessionId(cur.session.id);
      setTarget(cur.session.target);
      setCompleted(cur.session.completed);
      setRamp(0);
      setChoices([]);
      setPhase('choose'); // blank; the auto-load effect loads the next item
      return;
    }
    // Fresh session. The mixed Öva (no explicit subject, not a map deep-link) asks "har du
    // hörlurar?" first — spelling only interleaves in when the child is ready and has them.
    if (ready && !subjectParam && !startCode) {
      againRef.current = false;
      setPhase('headphones');
    } else {
      startSession();
    }
  }, [playerId, startSession, subjectParam, startCode]);

  useEffect(() => {
    if (!playerId) return void (location.href = '/');
    resumeOrStart();
  }, [playerId, resumeOrStart]);

  // Auto-load the first problem (map link, warm-up ramp, or resume) without flashing
  // the chooser.
  useEffect(() => {
    if (phase === 'choose' && sessionId != null && !autoStarted.current) {
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
          playerId, sessionId, code: c.code, seed: c.seed, given, idk: c.idk, tries: triesRef.current, warmup: item.warmup, intervalMs: c.intervalMs, idemKey: c.idemKey, env: c.env,
        });
        ackAnswers([c.idemKey]); // the server processed it (recorded or a retry) — clear it
        if (r.status !== 'retry' && r.session?.done) setDiplomas(r.diplomas ?? []); // B1: this session's burst crossings
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

  // A recognition (choice) rung reports (chosen, intervalMs) instead of a Captured; wrap
  // it into the SAME answer path — the tapped value is graded by the same grade().
  const onChoice = useCallback(
    (chosen: string | number, intervalMs: number) => {
      if (!item) return;
      onCapture({ idemKey: newIdemKey(playerId), code: item.code, seed: item.seed, given: String(chosen), intervalMs, idk: false, env: deviceEnvJson() });
    },
    [item, playerId, onCapture],
  );


  async function endEarly() {
    await postJSON('/api/session/end', { playerId, sessionId });
    location.href = '/';
  }

  if (phase === 'loading') return <div className="stage" />;

  if (phase === 'headphones') {
    return (
      <div className="stage">
        {icon && <div className="whoami" title={t('practice.you')}><EmojiIcon iconKey={icon} /></div>}
        <p className="prompt" style={{ fontSize: '1.7rem', marginBottom: '1.8rem' }}>Har du hörlurar?</p>
        <div style={{ display: 'flex', gap: '1.2rem', justifyContent: 'center' }}>
          <button className="choice-btn" onClick={() => startSession(againRef.current, true)}>
            <span className="choice-sample" style={{ fontSize: '2.6rem' }}><Emoji e="🎧" /></span>
            <span className="choice-label">Ja</span>
          </button>
          <button className="choice-btn" onClick={() => startSession(againRef.current, false)}>
            <span className="choice-sample" style={{ fontSize: '2.6rem' }}><HeadphonesOff /></span>
            <span className="choice-label">Nej</span>
          </button>
        </div>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <a className="quit-btn" href="/"><Emoji e="🏠" /> {t('common.home')}</a>
        </div>
      </div>
    );
  }

  // One-Öva track: no "vad vill du öva" chooser — the child drops straight into practice and the
  // selector serves the right rung (with a floor fallback). The blank stage shows only for the beat
  // before the auto-load effect fires the first item.
  if (phase === 'choose') return <div className="stage" />;

  if (phase === 'done') {
    return (
      <div className="stage">
        <div className="prompt" style={{ fontSize: '2rem' }}>{t('practice.done')}</div>
        <div className="done-today">
          <span className="day-dot on today" />
          {t('practice.doneToday')}
        </div>
        <p className="muted">{t('practice.doneCount', { n: target })}</p>
        {sessionId != null && <SessionAllocation sessionId={sessionId} playerId={playerId} />}
        {diplomas.length > 0 && (
          // WS III B1: a quiet, peak-end WITNESS of a fluency crossing that happened during play —
          // not a prize won here. No number, no speed, no compare. Batched into one line.
          <div className="diploma-earned">
            <p><Emoji e="🏅" /> {diplomas.length === 1
              ? `Grattis! Du fick diplom i ${diplomas[0]}.`
              : `Grattis! Du fick diplom i ${diplomas.slice(0, -1).join(', ')} och ${diplomas[diplomas.length - 1]}.`}</p>
          </div>
        )}
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.8rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="next-btn" onClick={restart}>{t('common.again')}</button>
          {hasDiplomas && <a className="next-btn" href={`/shelf?p=${playerId}`}><Emoji e="🏅" /> {t('home.diplomas')}</a>}
          <a className="next-btn" href={`/room?p=${playerId}`}><Emoji e="🐱" /> {t('room.title')}</a>
          <a className="next-btn primary" href="/"><Emoji e="🏠" /> {t('common.home')}</a>
        </div>
      </div>
    );
  }

  if (!item) return <div className="stage" />;

  // A recognition rung carries a `choice` spec (built deterministically from the seed) —
  // render it on ChoiceStage; everything else is typed on InputStage.
  const choiceItem = buildItem(item.code, item.seed).choice;
  // T1.5 "bygg ordet": the letter pad is CONSTRAINED to this word's tiles (its letters + a couple
  // distractors), shuffled deterministically from the seed. Other spelling tiers use the full pad.
  const spellingTiles = item.code === 'spelling_t15' ? buildTiles(buildItem(item.code, item.seed).answer, item.seed) : null;
  const isWordItem = item.family.startsWith('sp_') || item.family.startsWith('en_'); // dictation subjects (letter pad)

  return (
    <div className="stage">
      {icon && <div className="whoami" title={t('practice.you')}><EmojiIcon iconKey={icon} /></div>}
      <SessionBar completed={completed} target={target} />

      {/* Language cue: which tongue is THIS question in? A flag for the word subjects (a pre-reader
          can't read "English") — English (en_) shows 🇬🇧, Swedish spelling (spelling_) shows 🇸🇪; maths
          is language-neutral and shows none. Orients the child in a mixed Öva that switches per item. */}
      {(item.code.startsWith('en_') || item.code.startsWith('spelling_')) && (
        <img className="lang-flag" src={`/flags/${item.code.startsWith('en_') ? 'gb' : 'se'}.svg`}
          alt={item.code.startsWith('en_') ? 'Engelska' : 'Svenska'} width={40} height={26} />
      )}

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
      ) : choiceItem ? (
        <>
          <ChoiceStage
            itemKey={`${item.code}:${item.seed}`}
            prompt={choiceItem.prompt}
            question={choiceItem.question}
            options={choiceItem.options}
            onCapture={onChoice}
            disabled={busy || phase === 'correct'}
            armKey={armKey}
          />
          <div className="quiet-word fade">{phase === 'correct' ? word : retry ? t('practice.tryAgain') : ''}</div>
          <button className="quit-btn" onClick={endEarly}><Emoji e="🏠" /> {t('common.home')}</button>
        </>
      ) : item.acq ? (
        <>
          {/* SCAFFOLDED ACQUISITION: a fact she has met and not encoded, taught in-app as a faded
              derivation on the same pad and clock. Levels 0-2 only; the bare rung carries no acq. */}
          <AcquisitionStage
            key={`acq:${item.code}:${item.seed}`}
            item={{ code: item.code, seed: item.seed, family: item.family, answerLength: item.answerLength } as StageItem}
            level={item.acq.level}
            strategy={item.acq.strategy}
            playerId={playerId}
            locale={locale}
            onCapture={onCapture}
            disabled={busy || phase === 'correct'}
            showIdk
            idkLabel={t('practice.dontKnow')}
            armKey={armKey}
          />
          <div className="quiet-word fade">{phase === 'correct' ? word : retry ? t('practice.tryAgain') : ''}</div>
          <button className="quit-btn" onClick={endEarly}><Emoji e="🏠" /> {t('common.home')}</button>
        </>
      ) : (
        <>
          <InputStage
            // WS III burst (B0): a burst item auto-submits at answer length (sprint clock boundary),
            // so its interval is measured the same way a sprint's is. Otherwise identical to practice
            // (same ✓, same vet-inte, same reveal-on-miss) — the run stays invisible.
            mode={item.burst ? 'sprint' : 'session'}
            item={{ code: item.code, seed: item.seed, family: item.family, answerLength: item.answerLength } as StageItem}
            playerId={playerId}
            onCapture={onCapture}
            disabled={busy || phase === 'correct'}
            showIdk
            // Spelling AND English are DICTATION: the letter pad + a headphone control that plays
            // the word (the answer is never shown), and the "don't know" button becomes "Jag hör
            // inte" — the skip for a child with no headphones. English uses the a–z pad; Swedish
            // its full pad (or, for t15, the constrained tiles).
            idkLabel={isWordItem
              ? <span className="idk-hear"><HeadphonesOff /> Jag hör inte</span>
              : t('practice.dontKnow')}
            armKey={armKey}
            {...(isWordItem
              ? { letters: item.family.startsWith('en_') ? ENGLISH_LETTERS : (spellingTiles ?? SPELLING_LETTERS), promptNode: <Dictation itemKey={`${item.code}:${item.seed}`} code={item.code} seed={item.seed} /> }
              : {})}
          />
          <div className="quiet-word fade">{phase === 'correct' ? word : retry ? t('practice.tryAgain') : ''}</div>
          <button className="quit-btn" onClick={endEarly}><Emoji e="🏠" /> {t('common.home')}</button>
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

// T1.5 "bygg ordet" tiles: the word's unique letters + two distractors, shuffled DETERMINISTICALLY
// from the seed (so the pad is stable across re-renders). The child taps the given letters in order
// — sequenced production with the letters supplied (a pad button is reusable for a doubled letter).
function buildTiles(word: string, seed: number): string[] {
  const uniq = [...new Set(word.split(''))];
  const rng = makeRng((seed ^ 0x7ac) >>> 0);
  const pool = SPELLING_LETTERS.filter((l) => !uniq.includes(l));
  for (let i = pool.length - 1; i > 0; i--) { const j = rng.int(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const tiles = [...uniq, pool[0], pool[1]];
  for (let i = tiles.length - 1; i > 0; i--) { const j = rng.int(0, i); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
  return tiles;
}

// Crossed-out headphones — the "Jag hör inte" (no-headphones skip) glyph. Inline SVG so it
// renders identically on every tablet (there is no headphones-off emoji) and inherits the
// button's text colour via currentColor.
function HeadphonesOff() {
  return (
    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ verticalAlign: '-0.15em' }}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="2" y="14" width="4" height="6" rx="1.5" />
      <rect x="18" y="14" width="4" height="6" rx="1.5" />
      <line x1="3" y1="2.5" x2="21" y2="21.5" />
    </svg>
  );
}

// Dictation prompt for a spelling item: a big headphone button that PLAYS the word (T3 from
// the recorded clip, T2 from browser TTS) and never shows it. Auto-plays on a new item, and
// replays on tap. The child types the spelling on the letter pad; "Jag hör inte" (the idk
// button) skips it for a child without headphones.
function Dictation({ itemKey, code, seed }: { itemKey: string; code: string; seed: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);
  const play = useCallback(() => {
    stopAudio();
    const word = buildItem(code, seed).answer; // the client derives it, same as maths
    const audio = spellingAudio(code, word);
    if (audio.kind === 'file') {
      const a = new Audio(audio.url);
      audioRef.current = a;
      a.play().catch(() => {});
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(word);
      u.lang = audio.lang ?? 'sv-SE'; // English items speak in en-GB; Swedish default sv-SE
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
  }, [code, seed, stopAudio]);
  // Auto-play each new word (the chooser tap / previous answer is the user gesture that
  // unlocks audio); the button is the reliable replay. STOP the clip on item change/unmount so
  // a word never plays into the next (e.g. maths) item.
  useEffect(() => {
    stopAudio();
    const id = setTimeout(play, 250);
    return () => { clearTimeout(id); stopAudio(); };
  }, [itemKey, play, stopAudio]);
  return (
    <div className="dictation">
      <p className="dictation-hint">Skriv ordet du hör</p>
      <button type="button" className="listen-btn" onClick={play} aria-label="Hör ordet igen">
        <Emoji e="🔊" /> Hör ordet
      </button>
    </div>
  );
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

type RewardData = { progress: Record<string, number>; unlockedCats: string[]; unlockedProps: string[]; sharedTarget: Target; familyGoalOpen: boolean; familyGoalLabel: string | null };
function SessionAllocation({ sessionId, playerId }: { sessionId: number; playerId: string }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<RewardData | null>(null);
  const [chosen, setChosen] = useState<Target | null>(null);

  useEffect(() => {
    // Scope to THIS child (?p=) so the done screen shows the kid's OWN default target (their family
    // goal, a cat…) — not the family-wide fallback, which had every child defaulting to the fish.
    getJSON<RewardData>(`/api/reward?p=${encodeURIComponent(playerId)}`).then((d) => {
      setData(d);
      setChosen(d.sharedTarget);
    });
  }, [playerId]);

  async function pick(target: Target) {
    setChosen(target);
    const r = await postJSON<{ reward?: RewardData }>('/api/reward/allocate', { sessionId, target });
    if (r.reward) setData(r.reward);
  }

  if (!data || !chosen) return null;
  const cats = CATS.filter((c) => !data.unlockedCats.includes(c.id)).slice(0, 4);
  const label = (target: Target) => (target.kind === 'family' ? data.familyGoalLabel ?? t('room.familyGoal') : ROSTER_BY_ID.get(target.id)?.name[locale] ?? target.id);
  const same = (a: Target, b: Target) => a.kind === b.kind && a.id === b.id;
  const chosenCount = chosen.kind === 'family' ? `${data.progress['family'] ?? 0}` : `${data.progress[chosen.id] ?? 0}/${ROSTER_BY_ID.get(chosen.id)?.cost ?? 40}`;
  // If the family is collecting a piece of FURNITURE, keep it selectable here (the
  // cat chips are only the cats) so a kid who redirects can flow back to it.
  const sharedProp = data.sharedTarget.kind === 'prop' ? ROSTER_BY_ID.get(data.sharedTarget.id) : undefined;

  return (
    <div className="alloc-box">
      <div className="alloc-head">{t('reward.countsToward')} <span className="alloc-current">{label(chosen)}</span> — {chosenCount}</div>
      <div className="alloc-choices">
        {sharedProp && (
          <button className={`alloc-chip ${same(chosen, data.sharedTarget) ? 'on' : ''}`} onClick={() => pick(data.sharedTarget)}>
            <span className="prop-thumb" style={{ width: 20, height: 20, backgroundImage: `url(/props/${sharedProp.id}.png)` }} aria-hidden /> {sharedProp.name[locale]}
          </button>
        )}
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
            <Emoji e="🎯" /> {data.familyGoalLabel ?? t('room.familyGoal')}
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
