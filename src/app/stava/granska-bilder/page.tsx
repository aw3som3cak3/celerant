'use client';

// Eye-vet harness for the English on-ramp PICTURES (test family only, /api/stava/image-review gate).
// Sibling of the audio granska: it walks every picture asset a child taps — the verb pictograms (the
// hand-authored SVGs), the colour swatches, and the noun emoji — shows each at tap size next to its
// English word, plays the clip, and persists an OK / "läs fel" verdict so the picto rework can read
// the flagged list. The point is to catch a pictogram that doesn't read (does "run" look like "jump"?).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getJSON, postJSON } from '@/lib/client';
import { EN_VERBS, EN_COLORS, EN_NOUNS } from '@/lib/english-content';

type Kind = 'picto' | 'swatch' | 'noun';
type Clip = { kind: Kind; word: string; picto?: string; color?: string; emoji?: string };
type Verdict = 'ok' | 'bad';

const KIND_LABEL: Record<Kind, string> = { picto: 'Verb (SVG)', swatch: 'Färg', noun: 'Substantiv (emoji)' };

const CLIPS: Clip[] = [
  ...EN_VERBS.map((v): Clip => ({ kind: 'picto', word: v.word, picto: v.picto })),
  ...EN_COLORS.map((c): Clip => ({ kind: 'swatch', word: c.word, color: c.color })),
  ...EN_NOUNS.map((n): Clip => ({ kind: 'noun', word: n.word, emoji: n.emoji })),
];

const key = (c: { kind: string; word: string }) => `${c.kind}:${c.word}`;
type Filter = 'kvar' | 'alla' | 'flaggade';

function Picture({ c }: { c: Clip }) {
  if (c.kind === 'picto') return <img className="choice-pic" src={`/pictos/${c.picto}.svg`} alt="" width={110} height={110} />;
  if (c.kind === 'swatch') return <span style={{ display: 'block', width: 110, height: 110, borderRadius: 16, background: c.color, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }} aria-hidden />;
  return <img className="choice-pic" src={`/emoji/${c.emoji}.png`} alt="" width={110} height={110} />;
}

export default function GranskaBilderPage() {
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');
  const [reviews, setReviews] = useState<Record<string, { verdict: Verdict; note: string | null }>>({});
  const [filter, setFilter] = useState<Filter>('kvar');
  const [pos, setPos] = useState(0);
  const [note, setNote] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAudio = useCallback(() => { audioRef.current?.pause(); audioRef.current = null; }, []);
  const playClip = useCallback((word: string) => {
    stopAudio();
    const a = new Audio(`/audio/english/${encodeURIComponent(word)}.mp3`);
    audioRef.current = a;
    a.play().catch(() => {});
  }, [stopAudio]);
  useEffect(() => stopAudio, [stopAudio]);

  useEffect(() => {
    getJSON<{ authorized?: boolean; reviews?: { kind: string; word: string; verdict: Verdict; note: string | null }[] }>('/api/stava/image-review')
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
    setNote(reviews[key(current)]?.note ?? '');
    const id = setTimeout(() => playClip(current.word), 150);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, current?.kind, current?.word]);

  const submit = useCallback(
    (verdict: Verdict) => {
      if (!current) return;
      stopAudio();
      const c = current;
      setReviews((r) => ({ ...r, [key(c)]: { verdict, note: note.trim() || null } }));
      postJSON('/api/stava/image-review', { kind: c.kind, word: c.word, verdict, note: note.trim() || null }).catch(() => {});
      if (filter !== 'kvar') setPos((p) => p + 1);
    },
    [current, note, filter, stopAudio],
  );

  if (state === 'loading') return <div className="granska"><p>Laddar…</p></div>;
  if (state === 'denied')
    return <div className="granska"><h1>Granska bilder</h1><p>Den här sidan är bara tillgänglig för testfamiljen.</p></div>;

  return (
    <div className="granska">
      <h1>Granska bilder</h1>
      <p className="granska-hint">
        Titta på varje bild och avgör om den <em>tydligt</em> visar sitt engelska ord (t.ex. att «run»
        inte ser ut som «jump»). Flagga det som inte funkar — de görs om. Ordet visas (det är
        granskning). Omdömet sparas direkt. <a href="/stava/granska">→ Granska ljud</a>
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
        <p className="granska-hint">{filter === 'kvar' ? 'Allt är granskat! 🎉' : filter === 'flaggade' ? 'Inga flaggade bilder.' : 'Inga bilder.'}</p>
      ) : (
        <div className="granska-card">
          <span className="granska-tier">{KIND_LABEL[current.kind]}</span>
          <div style={{ margin: '0.6rem 0' }}><Picture c={current} /></div>
          <div className="granska-word">{current.word}</div>
          <button type="button" className="granska-play" onClick={() => playClip(current.word)}>🔊 Spela igen</button>
          {reviews[key(current)] && (
            <div className={`granska-prev ${reviews[key(current)].verdict}`}>
              tidigare: {reviews[key(current)].verdict === 'ok' ? '✓ bra' : '✗ läs fel'}
            </div>
          )}
          <input className="granska-note" placeholder="Anteckning (valfritt) — vad ser fel ut?" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="granska-actions">
            <button type="button" className="granska-ok" onClick={() => submit('ok')}>✓ Bra</button>
            <button type="button" className="granska-fel" onClick={() => submit('bad')}>✗ Ser fel ut</button>
            <button type="button" className="granska-skip" onClick={() => { stopAudio(); setPos((p) => p + 1); }}>Hoppa över →</button>
          </div>
          <div className="granska-progress">{Math.min(pos + 1, queue.length)} / {queue.length}</div>
        </div>
      )}
    </div>
  );
}
