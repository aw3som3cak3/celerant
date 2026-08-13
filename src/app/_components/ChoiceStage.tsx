'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChoicePromptData, ChoiceOption } from '@/lib/choice';
import { spellingAudio } from '@/lib/spelling-content';

export type { ChoicePromptData, ChoiceOption } from '@/lib/choice';

// The RECOGNITION input surface: a picture prompt + tap-one-of-N options. The choice
// sibling of the numpad (InputStage) and the letter pad — the third format the practice
// flow dispatches to once GROUND's Fler/Färre / pick-the-amount rungs are graph skills
// (one-ova-track WS II). It reuses InputStage's exact discipline: a two-rAF client clock
// started when the item paints, stopped on the tap, reported as intervalMs — so a
// recognition rung is timed on the same contract as everything else (as grounding
// evidence; recognition is never a fluency/sprint target). Grading is the caller's: the
// tapped value flows back through onCapture and is graded by the shared grade() (a
// numeral against an int answer, or 'combine'/'separate' against a word answer).

function Objects({ kind, n, small }: { kind: string; n: number; small?: boolean }) {
  return (
    <div className={`ground-cluster ${small ? 'small' : ''}`}>
      {Array.from({ length: n }, (_, i) => (
        <img key={i} className={`ground-obj ${small ? 'small' : ''}`} src={`/emoji/${kind}.png`} alt="" draggable={false} />
      ))}
    </div>
  );
}

export function ChoiceStage({
  itemKey,
  prompt,
  question,
  options,
  onCapture,
  disabled = false,
  armKey,
}: {
  itemKey: string | number; // changes per item ⇒ resets and restarts the clock (mount-equivalent)
  prompt: ChoicePromptData;
  question: string;
  options: ChoiceOption[];
  onCapture: (chosen: string | number, intervalMs: number) => void;
  disabled?: boolean;
  armKey?: number; // bump to RE-ARM after a first-wrong tap — accept a second tap, KEEP the clock
}) {
  const startRef = useRef(0);
  const capturedRef = useRef(false);

  useEffect(() => {
    capturedRef.current = false;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        startRef.current = performance.now();
      });
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [itemKey]);

  // Re-arm the SAME item for a retry: accept another tap but DON'T reset the clock (its
  // interval spans render→final tap, as with InputStage). Guarded so it never fires on mount.
  const armedRef = useRef(armKey);
  useEffect(() => {
    if (armKey === armedRef.current) return;
    armedRef.current = armKey;
    capturedRef.current = false;
  }, [armKey]);

  const pick = (value: string | number) => {
    if (capturedRef.current || disabled) return;
    capturedRef.current = true;
    const intervalMs = Math.max(0, Math.round(performance.now() - startRef.current));
    onCapture(value, intervalMs);
  };

  // A 'listen' prompt PLAYS the target word (never shows it) — the recognition sibling of the
  // dictation control, reusing spellingAudio. Auto-plays on each new item; the button replays.
  // The clip is held in a ref and STOPPED on any item change/unmount, so a spelling word never
  // keeps playing (or seems to replay) into the next — e.g. maths — item.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);
  const playPrompt = useCallback(() => {
    if (prompt.show !== 'listen') return;
    stopAudio();
    const audio = spellingAudio(prompt.code, prompt.word);
    if (audio.kind === 'file') {
      const a = new Audio(audio.url);
      audioRef.current = a;
      a.play().catch(() => {});
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(prompt.word);
      u.lang = 'sv-SE';
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
  }, [prompt, stopAudio]);
  useEffect(() => {
    stopAudio(); // new item → silence the previous clip before anything else
    if (prompt.show !== 'listen') return;
    const id = setTimeout(playPrompt, 250);
    return () => clearTimeout(id);
  }, [itemKey, playPrompt, prompt.show, stopAudio]);
  useEffect(() => stopAudio, [stopAudio]); // stop on unmount

  // GROUND structure rung: the child must SEE the event, not two static bunches. `played` drives a
  // one-shot animation — a bunch flies IN and joins (combine → fler) or flies OUT and vanishes
  // (separate → färre). It starts false (the "before" scene), flips true a beat after the item
  // paints so the child watches the action, and the replay button re-runs it.
  const isStructure = prompt.show === 'structure';
  const [played, setPlayed] = useState(false);
  const [revealed, setRevealed] = useState(false); // Fler/Färre stay LOCKED until the event has played once
  useEffect(() => {
    if (!isStructure) return;
    setPlayed(false);
    setRevealed(false);
    const t1 = setTimeout(() => setPlayed(true), 650); // "before" beat, then the bunch moves
    const t2 = setTimeout(() => setRevealed(true), 650 + 800); // unlock once the slide has finished
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [itemKey, isStructure]);
  const replayScene = useCallback(() => {
    setPlayed(false);
    setRevealed(false);
    setTimeout(() => setPlayed(true), 60);
    setTimeout(() => setRevealed(true), 60 + 800);
  }, []);

  return (
    <div className="input-stage">
      <div className="ground-stage">
        {prompt.show === 'listen' ? (
          <button type="button" className="listen-btn" onClick={playPrompt} aria-label="Hör ordet igen">
            <span aria-hidden>🔊</span> Hör ordet
          </button>
        ) : prompt.show === 'word' ? (
          // English print bridge (Phase D): read the printed word, then pick the picture.
          <div className="printed-word">{prompt.word}</div>
        ) : prompt.show === 'sentence' ? (
          // English sentence-mode: a printed SENTENCE. A 'sv' sentence carries the meaning (the
          // options are the candidate English renderings); an 'en' sentence is the cloze frame, whose
          // `___` renders as a visible gap the option fills.
          <div className={`sentence-prompt ${prompt.lang}`}>
            {prompt.text.split('___').flatMap((part, i, arr) =>
              i < arr.length - 1 ? [part, <span key={i} className="sentence-blank" aria-label="lucka" />] : [part],
            )}
          </div>
        ) : prompt.show === 'group' ? (
          <div className="ground-prompt">
            <Objects kind={prompt.kind} n={prompt.a} />
          </div>
        ) : prompt.show === 'sum' ? (
          <div className="ground-prompt">
            <Objects kind={prompt.kind} n={prompt.a} />
            <span className="ground-plus">+</span>
            <Objects kind={prompt.kind} n={prompt.b} />
          </div>
        ) : (
          // structure: base bunch + a delta bunch that arrives (combine) or departs (separate).
          // For separate, base = a-b and the delta (b) starts attached then leaves → a-b remain;
          // for combine, base = a and the delta (b) flies in → a+b. Grading only cares about the
          // direction, so the counts are pedagogical framing, not answer-bearing.
          <div className={`ground-structure-scene ${prompt.structure} ${played ? 'played' : ''}`}>
            <div className="ground-scene-row">
              <Objects kind={prompt.kind} n={prompt.structure === 'separate' ? prompt.a - prompt.b : prompt.a} />
              <div className="ground-delta">
                {Array.from({ length: prompt.b }, (_, i) => (
                  <img key={i} className="ground-obj" src={`/emoji/${prompt.kind}.png`} alt="" draggable={false} />
                ))}
              </div>
            </div>
            <button type="button" className="ground-replay" onClick={replayScene}>
              <span aria-hidden>🔁</span> Visa igen
            </button>
          </div>
        )}
      </div>

      <p className="ground-q">{question}</p>

      {isStructure ? (
        <div className="ground-choices">
          {options.map((o, i) =>
            o.render === 'more' || o.render === 'fewer' ? (
              <button key={i} className={`ground-choice ${o.render === 'more' ? 'more' : 'fewer'}`} onClick={() => pick(o.value)} disabled={disabled || !revealed} type="button">
                <span className="ground-choice-glyph">{o.render === 'more' ? '▲' : '▼'}</span>
                {o.label}
              </button>
            ) : null,
          )}
        </div>
      ) : (
        // A sentence prompt implies phrase-length options: stack them one per row so two whole
        // candidate sentences stay readable (and tappable) on a tablet instead of squeezing side-by-side.
        <div className={`ground-options ${options[0]?.render ?? 'numeral'}${prompt.show === 'sentence' ? ' stacked' : ''}`}>
          {options.map((o, i) =>
            o.render === 'numeral' ? (
              <button key={i} className="ground-option" onClick={() => pick(o.value)} disabled={disabled} type="button">
                <span className="ground-numeral">{o.value}</span>
              </button>
            ) : o.render === 'group' ? (
              <button key={i} className="ground-option" onClick={() => pick(o.value)} disabled={disabled} type="button">
                <Objects kind={o.kind} n={o.value} small />
              </button>
            ) : o.render === 'picture' ? (
              // T0: tap the emoji whose Swedish name starts with the target sound.
              <button key={i} className="ground-option picture" onClick={() => pick(o.value)} disabled={disabled} type="button">
                <img className="choice-pic" src={`/emoji/${o.kind}.png`} alt="" draggable={false} />
              </button>
            ) : o.render === 'letter' ? (
              // T1: tap the letter the heard word starts with.
              <button key={i} className="ground-option letter" onClick={() => pick(o.value)} disabled={disabled} type="button">
                <span className="ground-numeral">{o.value}</span>
              </button>
            ) : o.render === 'swatch' ? (
              // English on-ramp Phase B: tap the COLOUR you heard (no image asset — a CSS fill).
              <button key={i} className="ground-option swatch" onClick={() => pick(o.value)} disabled={disabled} type="button">
                <span className="colour-swatch" style={{ background: o.color }} aria-hidden />
              </button>
            ) : o.render === 'picto' ? (
              // English Phase B/C: tap the SVG pictogram (verbs/attributes the emoji photo-set lacks).
              <button key={i} className="ground-option picture" onClick={() => pick(o.value)} disabled={disabled} type="button">
                <img className="choice-pic" src={`/pictos/${o.kind}.png`} alt="" draggable={false} />
              </button>
            ) : o.render === 'sizednoun' ? (
              // Two-word recombination ("big cat"): the noun emoji, shown big or small.
              <button key={i} className="ground-option picture" onClick={() => pick(o.value)} disabled={disabled} type="button">
                <span className="sizednoun"><img src={`/emoji/${o.kind}.png`} alt="" draggable={false} style={{ width: o.big ? 104 : 46, height: o.big ? 104 : 46 }} /></span>
              </button>
            ) : o.render === 'nounverb' ? (
              // SVO frame ("the dog is running"): agent emoji + action pictogram — bind BOTH.
              <button key={i} className="ground-option picture" onClick={() => pick(o.value)} disabled={disabled} type="button">
                <span className="nounverb"><img src={`/emoji/${o.noun}.png`} alt="" draggable={false} /><img src={`/pictos/${o.verb}.png`} alt="" draggable={false} /></span>
              </button>
            ) : o.render === 'word' ? (
              // English print bridge (Phase D): tap the printed word you heard.
              <button key={i} className="ground-option word" onClick={() => pick(o.value)} disabled={disabled} type="button">
                <span className="word-option">{o.value}</span>
              </button>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
