'use client';

// Ear-vetting harness for the spelling word pools (gated to the test family via the same
// /api/me `spelling` flag as the Stava door). Unlike the child-facing dictation, this REVEALS
// the word — the point is to hear each word's TTS/recorded audio against its spelling and
// catch (a) dubbel-kusin ambiguities and (b) TTS mispronunciations before a child meets them.
// Pure review: nothing is recorded.

import { useEffect, useState } from 'react';
import { getJSON } from '@/lib/client';
import { Emoji } from '../../_components/Emoji';
import { T2_WORDS, T3_WORDS, T3_REVIEW_WORDS, spellingAudio } from '@/lib/spelling-content';

function play(code: string, word: string): void {
  const audio = spellingAudio(code, word);
  if (audio.kind === 'file') {
    new Audio(audio.url).play().catch(() => {});
  } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'sv-SE';
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
}

function WordGrid({ code, words }: { code: string; words: readonly string[] }) {
  return (
    <div className="granska-grid">
      {words.map((w) => (
        <button key={w} type="button" className="granska-chip" onClick={() => play(code, w)}>
          <Emoji e="🔊" /> {w}
        </button>
      ))}
    </div>
  );
}

export default function GranskaPage() {
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');
  useEffect(() => {
    getJSON<{ spellingReview?: boolean }>('/api/me')
      .then((me) => setState(me?.spellingReview ? 'ok' : 'denied'))
      .catch(() => setState('denied'));
  }, []);

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
      <h1>Granska stavningsord</h1>
      <p className="granska-hint">
        Tryck på ett ord för att höra det. Lyssna efter tvetydiga ord (t.ex. vars dubbel­konsonant-variant
        också är ett riktigt ord) och ord där rösten uttalar fel.
      </p>

      <h2>T2 — ljudenligt <span className="granska-count">(övning)</span></h2>
      <WordGrid code="spelling_t2" words={T2_WORDS.practice} />
      <h2>T2 — ljudenligt <span className="granska-count">(sprint/mätning)</span></h2>
      <WordGrid code="spelling_t2" words={T2_WORDS.holdout} />

      <h2>T3 — dubbelteckning <span className="granska-count">(inspelad röst)</span></h2>
      <WordGrid code="spelling_t3" words={T3_WORDS.practice} />
      <h2>T3 — dubbelteckning <span className="granska-count">(sprint/mätning)</span></h2>
      <WordGrid code="spelling_t3" words={T3_WORDS.holdout} />

      <h2>T3 — NYA par att granska <span className="granska-count">(ej live än)</span></h2>
      <p className="granska-hint">
        Lyssna på varje par (lång vokal → kort vokal): hörs skillnaden tydligt? Flagga par där Sofie
        inte gör lång/kort solklar, så byter jag. Först när de är godkända går de live.
      </p>
      <WordGrid code="spelling_t3" words={T3_REVIEW_WORDS} />
    </div>
  );
}
