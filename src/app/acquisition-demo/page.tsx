'use client';

import { useMemo, useState } from 'react';
import { AcquisitionStage } from '../_components/AcquisitionStage';
import { buildScaffold, L_FULL, L_PARTIAL, L_CUED, type StrategyId } from '@/lib/acquisition-content';
import { BY_CODE } from '@/skills';
import { buildItem } from '@/lib/item';
import { SPELLING_LETTERS, spellingAudio } from '@/lib/spelling-content';
import { ENGLISH_LETTERS } from '@/lib/english-content';
import { useI18n } from '../_components/LocaleProvider';
import { type Captured } from '../_components/InputStage';
import { grade } from '@/lib/grade';
import { TestFamilyGate } from '../_components/TestFamilyGate';

// The word subjects are DICTATION — hear the word, spell it. This tiny play button stands in for
// the real session's Dictation node so the discrimination ("kort/lång vokal?") can actually be
// judged by ear on the tablet.
function DemoDictation({ code, word }: { code: string; word: string }) {
  const play = () => {
    const a = spellingAudio(code, word);
    if (a.kind === 'file') { new Audio(a.url).play().catch(() => {}); }
    else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(word); u.lang = a.lang ?? 'sv-SE'; window.speechSynthesis.speak(u);
    }
  };
  return <button type="button" className="primary" style={{ fontSize: '1rem', padding: '0.4rem 1rem' }} onClick={play}>🔊 Spela ordet</button>;
}

const WORD_STRATEGIES = new Set<StrategyId>(['sv_double', 'en_irregular_cue']);

// THROWAWAY demo of the scaffolded-acquisition surface (AcquisitionStage), sibling of
// /choice-demo. Wired to nothing, writes NO data, playerId is a stub — it exists only to
// eyeball the L0→L2 faded derivation on a real tablet without having to fail a fact in a
// real session. Try "vet inte" on an L0 sub-step to see the fumble → reveal → carry-on path.

type Demo = { code: string; seed: number; strategy: StrategyId; level: number; label: string };

// One of each level, across a few tables/strategies, so the whole fade is visible in a lap.
const CASES: Demo[] = [
  // WORD SUBJECTS FIRST — the new, unvetted teaching (rule-walk + cue-fade). The maths räknestege
  // below is already vetted, so the word cases lead.
  { code: 'spelling_t3', seed: 0, strategy: 'sv_double', level: L_FULL, label: 'stavning: hör vokalen → dubbla?' },
  { code: 'spelling_t3', seed: 4, strategy: 'sv_double', level: L_CUED, label: 'stavning, bara ett tips' },
  { code: 'en_past_irregular', seed: 0, strategy: 'en_irregular_cue', level: L_FULL, label: 'engelska: hela ordet visas' },
  { code: 'en_past_irregular', seed: 2, strategy: 'en_irregular_cue', level: L_PARTIAL, label: 'engelska: halva ordet dolt' },
  { code: 'en_past_irregular', seed: 4, strategy: 'en_irregular_cue', level: L_CUED, label: 'engelska: bara första bokstaven' },
  { code: 'mult_table_6', seed: 3, strategy: 'x5_plus_one', level: L_FULL, label: '×6 via 5×b + en b till' },
  { code: 'mult_table_3', seed: 7, strategy: 'x2_plus_one', level: L_FULL, label: '×3 via 2×b + en b till' },
  { code: 'mult_table_8', seed: 5, strategy: 'x4_double', level: L_PARTIAL, label: '×8 via dubbla 4×b' },
  { code: 'mult_table_6', seed: 4, strategy: 'x5_plus_one', level: L_CUED, label: '×6, bara ett tips' },
  { code: 'mult_table_7', seed: 9, strategy: 'x5_plus_x2', level: L_CUED, label: '×7 via 5×b + 2×b' },
  // bridging-through-10 (the second domain, same faded scaffold on a make-ten seam)
  { code: 'add_cross_10', seed: 3, strategy: 'make_ten_add', level: L_FULL, label: 'tiokamrat: 8 + 5 via 10' },
  { code: 'sub_cross_10', seed: 6, strategy: 'make_ten_sub', level: L_FULL, label: 'tiokamrat baklänges: 14 − 6 via 10' },
  { code: 'add_cross_10', seed: 8, strategy: 'make_ten_add', level: L_CUED, label: 'tiokamrat, bara ett tips' },
  // division via inverse multiplication (56 / 8 → 8 × ? = 56)
  { code: 'div_table_8', seed: 5, strategy: 'div_inverse_mult', level: L_FULL, label: 'division baklänges: / 8 via 8 ×' },
  { code: 'div_table_7', seed: 2, strategy: 'div_inverse_mult', level: L_CUED, label: 'division, bara ett tips' },
  // 2-digit place value (split into tens + ones; borrow via compensation)
  { code: 'add_2d_carry', seed: 4, strategy: 'split_add_2d_carry', level: L_FULL, label: 'tvåsiffrig, växling: 47 + 28' },
  { code: 'sub_2d_borrow', seed: 5, strategy: 'split_sub_2d_borrow', level: L_FULL, label: 'tvåsiffrig, lån: 52 − 27 (runda av)' },
  { code: 'sub_2d_no_borrow', seed: 3, strategy: 'split_sub_2d', level: L_PARTIAL, label: 'tvåsiffrig minus, sista steget' },
  // negatives (sign-rule rewrites)
  { code: 'neg_sub_neg', seed: 4, strategy: 'neg_minus_minus', level: L_FULL, label: 'minus minus blir plus' },
  { code: 'neg_mult_neg_neg', seed: 6, strategy: 'neg_mult_same_sign', level: L_FULL, label: 'lika tecken: (−4)×(−6)' },
  { code: 'neg_div', seed: 3, strategy: 'neg_div_signs', level: L_FULL, label: 'olika tecken, division' },
  // decimals (add tenths as whole counts) + trainable fractions
  { code: 'dec_add_carry', seed: 3, strategy: 'dec_add_tenths', level: L_FULL, label: 'decimaler: 2,7 + 1,8 via tiondelar' },
  { code: 'frac_of_quantity', seed: 5, strategy: 'frac_of_qty', level: L_FULL, label: 'del av antal: 3/4 av 8' },
  { code: 'frac_equivalent', seed: 4, strategy: 'frac_equiv_scale', level: L_CUED, label: 'liknämnigt, bara ett tips' },
];

// Plain-language captions — what stage of learning this example shows the child. No level
// codes, no "5×b" notation, no answer spoiler: this page is for eyeballing the child's view.
const STAGE_CAPTION: Record<number, string> = {
  [L_FULL]: 'Barnet har precis mött det — allt stöd visas, steg för steg.',
  [L_PARTIAL]: 'Barnet börjar kunna det — bara sista steget kvar.',
  [L_CUED]: 'Nästan klart — bara ett litet tips kvar.',
};

export default function Page() { return <TestFamilyGate><AcquisitionDemo /></TestFamilyGate>; }
function AcquisitionDemo() {
  const { locale } = useI18n();
  const [idx, setIdx] = useState(0);
  const [res, setRes] = useState<{ ok: boolean; given: string; ms: number } | null>(null);
  const c = CASES[idx % CASES.length];
  const isWord = WORD_STRATEGIES.has(c.strategy);
  // Word items are DICTATION: the answer is the whole word (buildItem). Maths items derive a fact,
  // so the answer comes from the maths scaffold.
  const answer = useMemo(
    () => (isWord ? (buildItem(c.code, c.seed).answer as string) : buildScaffold(c.code, c.seed, c.strategy)?.answer ?? null),
    [c, isWord],
  );
  if (!answer) return <div className="stage"><p className="muted">Kunde inte bygga stödet.</p></div>;

  // Word items pass the letter pad + a play-audio node, which routes AcquisitionStage to its word
  // path. Maths items get the REAL family so the input pad matches the domain ("/", "−", ",").
  const letters = isWord ? (c.code.startsWith('en_') ? ENGLISH_LETTERS : SPELLING_LETTERS) : undefined;
  const item = { code: c.code, seed: c.seed, family: BY_CODE.get(c.code)?.family ?? 'multiplication', answerLength: isWord ? answer.length : answer.replace(/[^0-9]/g, '').length };
  const onCapture = (cap: Captured) =>
    setRes({ ok: !cap.idk && grade(cap.given, answer), given: cap.idk ? '(vet inte)' : cap.given, ms: cap.intervalMs });

  return (
    <div className="stage" style={{ textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.15rem', margin: '0 0 0.3rem' }}>{isWord ? 'Ordstege (test)' : 'Räknestege (test)'}</h1>
      <p className="muted" style={{ marginBottom: '0.2rem' }}>Så här lär appen ut {isWord ? 'ett ord' : 'ett tal'} barnet inte kan än — exempel {(idx % CASES.length) + 1} / {CASES.length}.</p>
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
          letters={letters}
          dictation={isWord ? <DemoDictation code={c.code} word={answer} /> : undefined}
        />
      )}
    </div>
  );
}
