'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { postJSON } from '@/lib/client';
import { useI18n } from '../_components/LocaleProvider';
import { buildScene, sceneResult, sceneSymbol, GROUND_ITEMS } from '@/lib/ground';

// GROUND / acquisition — the shadow scene surface (GROUND-phase spec §1). A child
// watches a concrete situation (things arriving or leaving) and judges whether there
// are now MORE or FEWER — the pre-reading meaning of combine vs separate. Only after
// choosing is the +/− SYMBOL shown, as a name for what they just did. No timer, no
// score, no gate: every choice is recorded and nothing else happens.
type Phase = 'ask' | 'named';

function Objects({ kind, n, className }: { kind: string; n: number; className?: string }) {
  return (
    <div className={`ground-cluster ${className ?? ''}`}>
      {Array.from({ length: n }, (_, i) => (
        <img key={i} className="ground-obj" src={`/emoji/${kind}.png`} alt="" draggable={false} />
      ))}
    </div>
  );
}

function Ground() {
  const { t } = useI18n();
  const p = useSearchParams().get('p') ?? '';
  const [seeds, setSeeds] = useState<number[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('ask');
  const [chosenRight, setChosenRight] = useState<boolean | null>(null);

  useEffect(() => {
    if (!p) { location.href = '/'; return; }
    postJSON<{ seeds: number[] }>('/api/ground/start', { playerId: p }).then((r) => setSeeds(r.seeds));
  }, [p]);

  const scene = useMemo(() => (seeds ? buildScene(seeds[idx]) : null), [seeds, idx]);

  const choose = useCallback(
    async (chosen: 'combine' | 'separate') => {
      if (!seeds || phase !== 'ask' || !scene) return;
      setChosenRight(chosen === scene.structure);
      setPhase('named');
      const last = idx + 1 >= seeds.length;
      await postJSON('/api/ground/answer', { playerId: p, seed: seeds[idx], chosen, done: last });
    },
    [seeds, phase, scene, idx, p],
  );

  const next = useCallback(() => {
    if (!seeds) return;
    if (idx + 1 >= seeds.length) { setIdx(seeds.length); return; } // → done
    setIdx((n) => n + 1);
    setPhase('ask');
    setChosenRight(null);
  }, [seeds, idx]);

  if (!seeds) return <div className="plain muted">…</div>;

  // Done: a warm close, no score.
  if (idx >= seeds.length) {
    return (
      <div className="plain" style={{ textAlign: 'center' }}>
        <h1>{t('ground.doneTitle')}</h1>
        <p className="muted">{t('ground.doneLine')}</p>
        <a className="primary" href="/" style={{ marginTop: '1rem' }}>{t('common.home')}</a>
      </div>
    );
  }

  if (!scene) return <div className="plain muted">…</div>;
  const result = sceneResult(scene);

  return (
    <div className="ground-wrap">
      <p className="muted ground-count">{idx + 1} / {GROUND_ITEMS}</p>

      <div className="ground-stage">
        {phase === 'ask' ? (
          // The situation: a starting group, and a moving group that ARRIVES (combine)
          // or LEAVES (separate). The motion is the stimulus the child reads.
          <div className="ground-groups">
            <Objects kind={scene.kind} n={scene.a} />
            <Objects
              kind={scene.kind}
              n={scene.b}
              className={scene.structure === 'combine' ? 'arriving' : 'leaving'}
            />
          </div>
        ) : (
          // Resolved: the result, counted, with the +/− symbol shown as its NAME.
          <div className="ground-resolved">
            <Objects kind={scene.kind} n={result} className="settled" />
            <div className="ground-symbol">{sceneSymbol(scene)}</div>
          </div>
        )}
      </div>

      {phase === 'ask' ? (
        <>
          <p className="ground-q">{t('ground.question')}</p>
          <div className="ground-choices">
            <button className="ground-choice more" onClick={() => choose('combine')}>
              <span className="ground-choice-glyph">▲</span>
              {t('ground.more')}
            </button>
            <button className="ground-choice fewer" onClick={() => choose('separate')}>
              <span className="ground-choice-glyph">▼</span>
              {t('ground.fewer')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={`ground-feedback ${chosenRight ? 'yes' : 'soft'}`}>
            {chosenRight ? t('ground.yes') : t('ground.soft')}
          </p>
          <button className="primary ground-next" onClick={next}>
            {idx + 1 >= seeds.length ? t('common.done') : t('ground.next')}
          </button>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="plain muted">…</div>}>
      <Ground />
    </Suspense>
  );
}
