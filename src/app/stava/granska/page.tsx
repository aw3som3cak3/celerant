'use client';

// The GRANSKA HUB (test family only). One place for everything Erik vets, so the surfaces
// aren't scattered across four URLs. Audio + pictures show a live "X kvar" from the shared
// clip lists (granska-clips.ts) minus what's already been reviewed; a fully-vetted surface
// sinks to the bottom marked done. The two demo surfaces (sentence + räknestege) are just
// eyeball-on-a-tablet links — no data, no count.

import { useEffect, useMemo, useState } from 'react';
import { getJSON } from '@/lib/client';
import { Emoji } from '../../_components/Emoji';
import { AUDIO_CLIPS, audioKey, IMAGE_CLIPS, imageKey } from '@/lib/granska-clips';

type Reviewed = { reviews?: { tier?: string; kind?: string; word: string }[]; authorized?: boolean };

export default function GranskaHub() {
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');
  const [audioDone, setAudioDone] = useState<Set<string>>(new Set());
  const [imageDone, setImageDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      getJSON<Reviewed>('/api/stava/audio-review').catch(() => null),
      getJSON<Reviewed>('/api/stava/image-review').catch(() => null),
    ]).then(([a, i]) => {
      if (!a?.authorized && !i?.authorized) return setState('denied');
      setAudioDone(new Set((a?.reviews ?? []).map((r) => audioKey({ tier: r.tier ?? '', word: r.word }))));
      setImageDone(new Set((i?.reviews ?? []).map((r) => imageKey({ kind: r.kind ?? '', word: r.word }))));
      setState('ok');
    });
  }, []);

  const audioKvar = useMemo(() => AUDIO_CLIPS.filter((c) => !audioDone.has(audioKey(c))).length, [audioDone]);
  const imageKvar = useMemo(() => IMAGE_CLIPS.filter((c) => !imageDone.has(imageKey(c))).length, [imageDone]);

  if (state === 'loading') return <div className="granska"><p>Laddar…</p></div>;
  if (state === 'denied')
    return <div className="granska"><h1>Granska</h1><p>Den här sidan är bara tillgänglig för testfamiljen.</p></div>;

  type Surface = { icon: string; label: string; href: string; kvar?: number };
  // The CURRENT vet needs only — vetted surfaces (the maths räknestege, the sentence demo) are
  // dropped; the acquisition demo now leads with the new WORD teaching (rule-walk + cue-fade).
  const surfaces: Surface[] = [
    { icon: '🔊', label: 'Ljud (stavningsklipp)', href: '/stava/granska/ljud', kvar: audioKvar },
    { icon: '🖼️', label: 'Bilder (engelska + storlek/verb)', href: '/stava/granska-bilder', kvar: imageKvar },
    { icon: '🔤', label: 'Ordstege — stavning + engelska (rule-walk + cue-fade)', href: '/acquisition-demo' },
    { icon: '🍕', label: 'Modell — matematisk modellering (pizza)', href: '/model-demo' },
    { icon: '🐛', label: 'Trasiga frågor (fel/idk-logg)', href: '/stava/fragor' },
  ];
  // Outstanding first; a done surface (0 kvar) sinks to the bottom. Demos keep their order.
  const rank = (s: Surface) => (s.kvar === undefined ? 1 : s.kvar > 0 ? 0 : 2);
  surfaces.sort((a, b) => rank(a) - rank(b));

  return (
    <div className="granska">
      <h1>Granska</h1>
      <p className="granska-hint">Allt som ska granskas på ett ställe. Siffran visar hur många som är kvar.</p>
      <div className="granska-hub">
        {surfaces.map((s) => {
          const done = s.kvar === 0;
          const status = s.kvar === undefined ? 'öppna →' : done ? '✓ klart' : `${s.kvar} kvar`;
          return (
            <a key={s.href} href={s.href} className={`granska-hub-row ${done ? 'done' : ''}`}>
              <span className="granska-hub-icon"><Emoji e={s.icon} /></span>
              <span className="granska-hub-label">{s.label}</span>
              <span className={`granska-hub-status ${s.kvar && s.kvar > 0 ? 'kvar' : ''}`}>{status}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
