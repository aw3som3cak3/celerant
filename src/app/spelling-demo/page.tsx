'use client';

import { useState } from 'react';
import { InputStage, type Captured } from '../_components/InputStage';

// THROWAWAY local demo of the spelling LetterPad (increment 2). Wired to NOTHING —
// no player, no session, no data written, not linked from anywhere — it exists only to
// feel the letter pad, the å ä ö keys, the entry display and the client clock on a real
// tablet before the actual spelling content (subject scoping + T2 words, increments 3–4)
// exists. It is a COPY task (the word is shown), which tests the PAD ERGONOMICS; the real
// task is dictation, which needs the recorded audio and the item-provider. Delete when T2
// content lands. Grading is the same case-insensitive rule the real skill will use.

const WORDS = ['sol', 'katt', 'måne', 'träd', 'öga', 'fisk', 'björn', 'hund', 'kök', 'ägg'];
// The pad shows the TIER's letters (a fixed set + distractors, incl. å ä ö), never just
// the item's letters — so spelling a word is real recall, not a permutation puzzle (A6).
const PAD = ['a', 'b', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'r', 's', 't', 'u', 'y', 'å', 'ä', 'ö'];

export default function SpellingDemo() {
  const [idx, setIdx] = useState(0);
  const [res, setRes] = useState<{ ok: boolean; given: string; ms: number } | null>(null);
  const word = WORDS[idx % WORDS.length];

  const onCapture = (c: Captured) => {
    const given = c.given.trim().toLowerCase();
    setRes({ ok: given === word, given, ms: c.intervalMs });
  };

  return (
    <div className="stage" style={{ textAlign: 'center' }}>
      <p className="muted">LetterPad-demo (test, ingen data sparas) — ord {(idx % WORDS.length) + 1} / {WORDS.length}</p>
      {res ? (
        <div className="plain">
          <div style={{ fontSize: '2.5rem' }}>{res.ok ? '✅' : '✏️'}</div>
          <h2>{res.ok ? 'Rätt!' : 'Nästan'}</h2>
          <p className="muted">du skrev “{res.given || '—'}” — ordet var “{word}”</p>
          <p className="muted">tid på tangentbordet: {res.ms} ms</p>
          <button className="primary" onClick={() => { setRes(null); setIdx((i) => i + 1); }} style={{ marginTop: '1rem' }}>
            Nästa ord →
          </button>
        </div>
      ) : (
        <InputStage
          mode="session"
          item={{ code: 'demo', seed: idx, family: 'spelling', answerLength: word.length }}
          playerId="demo"
          letters={PAD}
          onCapture={onCapture}
          promptNode={<div style={{ fontSize: '2rem', letterSpacing: '0.08em' }}>Skriv ordet: <b>{word}</b></div>}
        />
      )}
    </div>
  );
}
