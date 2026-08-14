'use client';

// Ear-vetting harness for the spelling clips (test family only, /api/stava/audio-review gate).
// Unlike child dictation it REVEALS the word — the point is to hear every pre-generated Sofie clip
// against its spelling and flag the ones that sound wrong (e.g. "hämta" misheard). Reached from the
// granska hub; the clip list is shared with the hub's "kvar" count (granska-clips.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getJSON, postJSON } from '@/lib/client';
import { Emoji } from '../../../_components/Emoji';
import { spellingAudio } from '@/lib/spelling-content';
import { AUDIO_CLIPS as CLIPS, audioKey as key, type AudioTier as Tier } from '@/lib/granska-clips';

type Verdict = 'ok' | 'bad';
const TIER_LABEL: Record<Tier, string> = { recog: 'Igenkänning', t2: 'T2 (skriva ordet)', t3: 'T3 (dubbelteckning)' };
type Filter = 'kvar' | 'alla' | 'flaggade';

export default function GranskaLjudPage() {
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');
  const [reviews, setReviews] = useState<Record<string, { verdict: Verdict; note: string | null }>>({});
  const [filter, setFilter] = useState<Filter>('kvar');
  const [pos, setPos] = useState(0);
  const [note, setNote] = useState('');

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
  useEffect(() => stopAudio, [stopAudio]);

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
    return CLIPS.filter((c) => !reviews[key(c)]);
  }, [filter, reviews]);

  const current = queue[Math.min(pos, Math.max(0, queue.length - 1))];
  const reviewedCount = Object.keys(reviews).length;
  const badCount = Object.values(reviews).filter((r) => r.verdict === 'bad').length;

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
      stopAudio();
      const c = current;
      setReviews((r) => ({ ...r, [key(c)]: { verdict, note: note.trim() || null } }));
      postJSON('/api/stava/audio-review', { tier: c.tier, word: c.word, verdict, note: note.trim() || null }).catch(() => {});
      if (filter !== 'kvar') setPos((p) => p + 1);
    },
    [current, note, filter],
  );

  if (state === 'loading') return <div className="granska"><p>Laddar…</p></div>;
  if (state === 'denied')
    return (
      <div className="granska">
        <h1>Granska stavningsljud</h1>
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
        <a href="/stava/granska">← Tillbaka till Granska</a>
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
