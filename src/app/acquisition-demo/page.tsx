'use client';

import { useMemo, useState } from 'react';
import { AcquisitionStage } from '../_components/AcquisitionStage';
import { buildScaffold, buildWordScaffold, L_FULL, L_PARTIAL, L_CUED, type StrategyId } from '@/lib/acquisition-content';
import { BY_CODE } from '@/skills';
import { buildItem } from '@/lib/item';
import { SPELLING_LETTERS, spellingAudio } from '@/lib/spelling-content';
import { ENGLISH_LETTERS } from '@/lib/english-content';
import { useI18n } from '../_components/LocaleProvider';
import { type Captured } from '../_components/InputStage';
import { grade } from '@/lib/grade';

// THROWAWAY demo of the scaffolded-acquisition surface (AcquisitionStage), sibling of
// /choice-demo. Wired to nothing, writes NO data, playerId is a stub — it exists only to
// eyeball the L0→L2 faded derivation (maths) and the word-subject fade (spelling/English,
// on the letter pad + a play button) on a real tablet without failing a fact in a real
// session. Try "vet inte" on an L0 sub-step to see the fumble → reveal → carry-on path.

type Demo = { code: string; seed: number; strategy: StrategyId; level: number; label: string };

const isWordCode = (code: string) => code.startsWith('spelling_') || code.startsWith('en_');

// One of each level, across a few strategies, so the whole fade is visible in a lap.
const CASES: Demo[] = [
  { code: 'mult_table_6', seed: 3, strategy: 'x5_plus_one', level: L_FULL, label: '×6 via 5×b + en b till' },
  { code: 'mult_table_8', seed: 5, strategy: 'x4_double', level: L_PARTIAL, label: '×8 via dubbla 4×b' },
  { code: 'mult_table_6', seed: 4, strategy: 'x5_plus_one', level: L_CUED, label: '×6, bara ett tips' },
  // bridging-through-10
  { code: 'add_cross_10', seed: 3, strategy: 'make_ten_add', level: L_FULL, label: 'tiokamrat: 8 + 5 via 10' },
  { code: 'sub_cross_10', seed: 6, strategy: 'make_ten_sub', level: L_FULL, label: 'tiokamrat baklänges: 14 − 6 via 10' },
  // division via inverse multiplication
  { code: 'div_table_8', seed: 5, strategy: 'div_inverse_mult', level: L_FULL, label: 'division baklänges: / 8 via 8 ×' },
  // 2-digit place value
  { code: 'add_2d_carry', seed: 4, strategy: 'split_add_2d_carry', level: L_FULL, label: 'tvåsiffrig, växling: 47 + 28' },
  { code: 'sub_2d_borrow', seed: 5, strategy: 'split_sub_2d_borrow', level: L_FULL, label: 'tvåsiffrig, lån: 52 − 27 (runda av)' },
  // negatives + decimals + fractions
  { code: 'neg_mult_neg_neg', seed: 6, strategy: 'neg_mult_same_sign', level: L_FULL, label: 'lika tecken: (−4)×(−6)' },
  { code: 'dec_add_carry', seed: 3, strategy: 'dec_add_tenths', level: L_FULL, label: 'decimaler: 2,7 + 1,8 via tiondelar' },
  { code: 'frac_of_quantity', seed: 5, strategy: 'frac_of_qty', level: L_FULL, label: 'del av antal: 3/4 av 8' },
  // ── WORD SUBJECTS (letter pad + play button) ──
  // rule-application-fade · Swedish doubling (spelling_t3): hear the word → kort/lång → dubbla
  { code: 'spelling_t3', seed: 2, strategy: 'sv_double', level: L_FULL, label: 'stavning: dubbelteckning (vitt)' },
  { code: 'spelling_t3', seed: 2, strategy: 'sv_double', level: L_CUED, label: 'stavning: dubbelteckning, bara tips' },
  // cue-fade · English irregular past (en_past_irregular): whole → gapped → first-letter
  { code: 'en_past_irregular', seed: 0, strategy: 'en_irregular_cue', level: L_FULL, label: 'engelska: oregelbunden dåtid (went)' },
  { code: 'en_past_irregular', seed: 0, strategy: 'en_irregular_cue', level: L_PARTIAL, label: 'engelska: dåtid, ordet gömt' },
  // branching rule-fade · English -ed (en_ed_regular): read base → 3-way rule choice → produce
  { code: 'en_ed_regular', seed: 40, strategy: 'en_ed_rule', level: L_FULL, label: 'engelska: -ed regel (stop→stopped)' },
  { code: 'en_ed_regular', seed: 4, strategy: 'en_ed_rule', level: L_CUED, label: 'engelska: -ed, bara tips' },
];

// Plain-language captions — what stage of learning this example shows the child.
const STAGE_CAPTION: Record<number, string> = {
  [L_FULL]: 'Barnet har precis mött det — hela stödet visas, steg för steg.',
  [L_PARTIAL]: 'Barnet börjar kunna det — bara sista steget kvar.',
  [L_CUED]: 'Nästan klart — bara ett litet tips kvar.',
};

// A minimal play button for the word cases (the practice page's Dictation, reduced to eyeball-only —
// no auto-play, no clip lifecycle). Plays the dictated word via the shared spellingAudio.
function DemoDictation({ code, seed }: { code: string; seed: number }) {
  const play = () => {
    const word = buildItem(code, seed).answer;
    const audio = spellingAudio(code, word);
    if (audio.kind === 'file') {
      new Audio(audio.url).play().catch(() => {});
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(word);
      u.lang = audio.lang ?? 'sv-SE';
      window.speechSynthesis.speak(u);
    }
  };
  return (
    <button type="button" className="listen-btn" onClick={play} aria-label="Hör ordet">
      <span aria-hidden>🔊</span> Hör ordet
    </button>
  );
}

export default function AcquisitionDemo() {
  const { locale } = useI18n();
  const [idx, setIdx] = useState(0);
  const [res, setRes] = useState<{ ok: boolean; given: string; ms: number } | null>(null);
  const c = CASES[idx % CASES.length];
  const word = isWordCode(c.code);
  const mathScaffold = useMemo(() => (word ? null : buildScaffold(c.code, c.seed, c.strategy)), [c, word]);
  const wordScaffold = useMemo(() => (word ? buildWordScaffold(c.code, c.seed, c.strategy) : null), [c, word]);
  const answer = word ? wordScaffold?.answer : mathScaffold?.answer;

  if (answer == null) return <div className="stage"><p className="muted">Kunde inte bygga scaffold.</p></div>;

  // The REAL family so the maths pad matches the domain; word items use the letter pad.
  const family = BY_CODE.get(c.code)?.family ?? 'multiplication';
  const letters = word ? (c.code.startsWith('en_') ? ENGLISH_LETTERS : SPELLING_LETTERS) : undefined;
  const item = { code: c.code, seed: c.seed, family, answerLength: word ? answer.length : answer.replace(/[^0-9]/g, '').length };
  const onCapture = (cap: Captured) =>
    setRes({ ok: !cap.idk && grade(cap.given, answer), given: cap.idk ? '(vet inte)' : cap.given, ms: cap.intervalMs });

  return (
    <div className="stage" style={{ textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.15rem', margin: '0 0 0.3rem' }}>Inlärningsstege (test)</h1>
      <p className="muted" style={{ marginBottom: '0.2rem' }}>Så här lär appen ut något barnet inte kan än — exempel {(idx % CASES.length) + 1} / {CASES.length}.</p>
      <p className="muted">{STAGE_CAPTION[c.level]}</p>
      {res ? (
        <div className="plain">
          <div style={{ fontSize: '2.5rem' }}>{res.ok ? '✅' : '🤔'}</div>
          <h2>{res.ok ? 'Rätt!' : 'Nästan'}</h2>
          <p className="muted">du skrev “{res.given}” — rätt var “{answer}”</p>
          <button className="primary" onClick={() => { setRes(null); setIdx((i) => i + 1); }} style={{ marginTop: '1rem' }}>Nästa exempel →</button>
        </div>
      ) : (
        <AcquisitionStage
          key={idx}
          item={item}
          level={c.level}
          strategy={c.strategy}
          playerId="demo"
          locale={locale}
          onCapture={onCapture}
          showIdk
          {...(word ? { letters, dictation: <DemoDictation code={c.code} seed={c.seed} /> } : {})}
        />
      )}
    </div>
  );
}
