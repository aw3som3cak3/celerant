'use client';

// Ear-vetting harness for the spelling clips (test family only, /api/me `spellingReview` gate).
// Unlike child dictation it REVEALS the word — the point is to hear every pre-generated Sofie clip
// against its spelling and flag the ones that sound wrong (e.g. "hämta" misheard). It walks ALL
// clips (recognition + T2 + T3), not just T3, and PERSISTS each verdict (audio_review) so the
// review resumes and the carrier-sentence regeneration can read the flagged list.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getJSON, postJSON } from '@/lib/client';
import { Emoji } from '../../_components/Emoji';
import { RECOG_WORDS, TRANSPARENT_WORDS, SPELLING_POOLS, spellingAudio } from '@/lib/spelling-content';

type Tier = 'recog' | 't2' | 't3';
type Clip = { tier: Tier; code: string; word: string };
type Verdict = 'ok' | 'bad';

const TIER_LABEL: Record<Tier, string> = { recog: 'Igenkänning', t2: 'T2 (skriva ordet)', t3: 'T3 (dubbelteckning)' };

// The full clip list, built from the banks (the same words children hear). A tier maps to the
// audio folder via any skill code on that path: recog → /recog/, t2 → /t2/, t3 → /t3/.
const CLIPS: Clip[] = (() => {
  const recog = Array.from(new Set([...RECOG_WORDS.map((w) => w.word), ...TRANSPARENT_WORDS.map((w) => w.word)]));
  const t2 = [...SPELLING_POOLS.spelling_t2.practice, ...SPELLING_POOLS.spelling_t2.holdout];
  const t3 = [...SPELLING_POOLS.spelling_t3.practice, ...SPELLING_POOLS.spelling_t3.holdout];
  return [
    ...recog.map((word) => ({ tier: 'recog' as const, code: 'spelling_t0', word })),
    ...t2.map((word) => ({ tier: 't2' as const, code: 'spelling_t2', word })),
    ...t3.map((word) => ({ tier: 't3' as const, code: 'spelling_t3', word })),
  ];
})();

const key = (c: { tier: string; word: string }) => `${c.tier}:${c.word}`;

type Filter = 'kvar' | 'alla' | 'flaggade';

export default function GranskaPage() {
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');
  const [reviews, setReviews] = useState<Record<string, { verdict: Verdict; note: string | null }>>({});
  const [filter, setFilter] = useState<Filter>('kvar');
  const [pos, setPos] = useState(0);
  const [note, setNote] = useState('');

  // Hold the playing clip in a ref and STOP it before the next one (or on advancing / unmount), so
  // clicking Bra / Lät fel / Hoppa never leaves the previous word talking over the next.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);
  const playClip = useCallback((code: string, word: string) => {
    stopAudio();
    const audio = spellingAudio(code, word);
    if (audio.kind === 'file') {
      const a = new Audio(audio.url);
      audioRef.current = a;
      a.play().catch(() => {});
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(word);
      u.lang = audio.lang ?? 'sv-SE';
      window.speechSynthesis.speak(u);
    }
  }, [stopAudio]);
  useEffect(() => stopAudio, [stopAudio]); // stop on unmount

  useEffect(() => {
    getJSON<{ authorized?: boolean; reviews?: { tier: string; word: string; verdict: Verdict; note: string | null }[] }>('/api/stava/audio-review')
      .then((r) => {
        if (!r?.authorized) return setState('denied');
        const map: Record<string, { verdict: Verdict; note: string | null }> = {};
        for (const rv of r.reviews ?? []) map[key(rv)] = { verdict: rv.verdict, note: rv.note };
        setReviews(map);
        setState('ok');
      })
      .catch(() => setState('denied'));
  }, []);

  const queue = useMemo(() => {
    if (filter === 'alla') return CLIPS;
    if (filter === 'flaggade') return CLIPS.filter((c) => reviews[key(c)]?.verdict === 'bad');
    return CLIPS.filter((c) => !reviews[key(c)]); // 'kvar' — not yet reviewed
  }, [filter, reviews]);

  const current = queue[Math.min(pos, Math.max(0, queue.length - 1))];
  const reviewedCount = Object.keys(reviews).length;
  const badCount = Object.values(reviews).filter((r) => r.verdict === 'bad').length;

  // Auto-play the current clip and load any saved note when it changes. Stop the previous clip
  // IMMEDIATELY (not only when the next starts 200ms later), so advancing is instantly silent.
  useEffect(() => {
    if (state !== 'ok' || !current) return;
    stopAudio();
    setNote(reviews[key(current)]?.note ?? '');
    const id = setTimeout(() => playClip(current.code, current.word), 200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, current?.tier, current?.word]);

  const submit = useCallback(
    (verdict: Verdict) => {
      if (!current) return;
      stopAudio(); // clicking OK / Lät fel silences the current clip at once
      const c = current;
      setReviews((r) => ({ ...r, [key(c)]: { verdict, note: note.trim() || null } }));
      postJSON('/api/stava/audio-review', { tier: c.tier, word: c.word, verdict, note: note.trim() || null }).catch(() => {});
      // In 'kvar' the clip drops out of the queue → the same pos now shows the next; otherwise advance.
      if (filter !== 'kvar') setPos((p) => p + 1);
    },
    [current, note, filter],
  );

  if (state === 'loading') return <div className="granska"><p>Laddar…</p></div>;
  if (state === 'denied')
    return (
      <div className="granska">
        <h1>Granska stavningsord</h1>
        <p>Den här sidan är bara tillgänglig för testfamiljen.</p>
      </div>
    );

  return (
    <div className="granska">
      <h1>Granska stavningsljud</h1>
      <p className="granska-hint">
        Lyssna på varje klipp och avgör om Sofie säger ordet <em>tydligt och rätt</em>. Flagga
        det som låter fel eller otydligt (som «hämta») — de får bärande meningar och görs om.
        Ordet visas här (det är granskning, inte diktamen). Omdömet sparas direkt.{' '}
        <a href="/stava/fragor">→ Trasiga frågor (fel/idk-logg)</a>
      </p>

      <div className="granska-stats">
        <span><strong>{reviewedCount}</strong>/{CLIPS.length} granskade</span>
        <span className="granska-bad">✗ {badCount} flaggade</span>
        <span>{CLIPS.length - reviewedCount} kvar</span>
      </div>

      <div className="granska-filter">
        {(['kvar', 'alla', 'flaggade'] as Filter[]).map((f) => (
          <button key={f} type="button" className={`granska-tab ${filter === f ? 'on' : ''}`} onClick={() => { setFilter(f); setPos(0); }}>
            {f === 'kvar' ? 'Kvar att granska' : f === 'alla' ? 'Alla' : 'Flaggade'}
          </button>
        ))}
      </div>

      {!current ? (
        <p className="granska-hint">
          {filter === 'kvar' ? 'Allt är granskat! 🎉' : filter === 'flaggade' ? 'Inga flaggade klipp.' : 'Inga klipp.'}
        </p>
      ) : (
        <div className="granska-card">
          <span className="granska-tier">{TIER_LABEL[current.tier]}</span>
          <button type="button" className="granska-play" onClick={() => playClip(current.code, current.word)}>
            <Emoji e="🔊" /> Spela igen
          </button>
          <div className="granska-word">{current.word}</div>
          {reviews[key(current)] && (
            <div className={`granska-prev ${reviews[key(current)].verdict}`}>
              tidigare: {reviews[key(current)].verdict === 'ok' ? '✓ bra' : '✗ lät fel'}
            </div>
          )}
          <input
            className="granska-note"
            placeholder="Anteckning (valfritt) — vad lät fel?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="granska-actions">
            <button type="button" className="granska-ok" onClick={() => submit('ok')}>✓ Bra</button>
            <button type="button" className="granska-fel" onClick={() => submit('bad')}>✗ Lät fel</button>
            <button type="button" className="granska-skip" onClick={() => { stopAudio(); setPos((p) => p + 1); }}>Hoppa över →</button>
          </div>
          <div className="granska-progress">{Math.min(pos + 1, queue.length)} / {queue.length}</div>
        </div>
      )}
    </div>
  );
}
