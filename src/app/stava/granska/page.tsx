'use client';

// The GRANSKA HUB (test family only). One place for everything Erik vets, so the surfaces
// aren't scattered across URLs. Audio + pictures show a live "X kvar" from the shared clip lists
// (granska-clips.ts) minus what's already reviewed. The ELECTRONICS block leads now: the körkort
// flow is played inside a normal test-family Öva, so this hub links the surfaces that show it —
// the build/körkort approval, and each child's diploma shelf (which needs a playerId).

import { useEffect, useMemo, useState } from 'react';
import { getJSON } from '@/lib/client';
import { Emoji } from '../../_components/Emoji';
import { AUDIO_CLIPS, audioKey, IMAGE_CLIPS, imageKey } from '@/lib/granska-clips';

type Reviewed = { reviews?: { tier?: string; kind?: string; word: string }[]; authorized?: boolean };
type ElecPlayer = { id: string; icon: string; schoolYear: number };
type ElecData = { authorized?: boolean; players?: ElecPlayer[] };

export default function GranskaHub() {
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');
  const [audioDone, setAudioDone] = useState<Set<string>>(new Set());
  const [imageDone, setImageDone] = useState<Set<string>>(new Set());
  const [players, setPlayers] = useState<ElecPlayer[]>([]);

  useEffect(() => {
    Promise.all([
      getJSON<Reviewed>('/api/stava/audio-review').catch(() => null),
      getJSON<Reviewed>('/api/stava/image-review').catch(() => null),
      getJSON<ElecData>('/api/electronics').catch(() => null),
    ]).then(([a, i, e]) => {
      if (!a?.authorized && !i?.authorized) return setState('denied');
      setAudioDone(new Set((a?.reviews ?? []).map((r) => audioKey({ tier: r.tier ?? '', word: r.word }))));
      setImageDone(new Set((i?.reviews ?? []).map((r) => imageKey({ kind: r.kind ?? '', word: r.word }))));
      setPlayers(e?.players ?? []);
      setState('ok');
    });
  }, []);

  const audioKvar = useMemo(() => AUDIO_CLIPS.filter((c) => !audioDone.has(audioKey(c))).length, [audioDone]);
  const imageKvar = useMemo(() => IMAGE_CLIPS.filter((c) => !imageDone.has(imageKey(c))).length, [imageDone]);

  if (state === 'loading') return <div className="granska"><p>Laddar…</p></div>;
  if (state === 'denied')
    return <div className="granska"><h1>Granska</h1><p>Den här sidan är bara tillgänglig för testfamiljen.</p></div>;

  type Surface = { icon: string; label: string; href: string; kvar?: number };

  // ELECTRONICS (current focus). Electronics now runs inside a normal test-family Öva, so the whole
  // fundamentals → fluency → körkort flow is playable; these surfaces show it. The diploma shelf
  // needs a playerId, so one row per test child.
  const elec: Surface[] = [
    { icon: '🎖️', label: 'Körkort & byggen — godkänn vid bänken (vuxen-PIN)', href: '/electronics' },
    ...players.map((p) => ({
      icon: '🏅',
      label: `Diplomrum — ${p.icon} åk ${p.schoolYear} (diplom + körkort)`,
      href: `/shelf?p=${p.id}`,
    })),
    { icon: '🔌', label: 'Bygg en krets — komposition (snäpp ihop, riktiga färgband)', href: '/krets-demo' },
    { icon: '💡', label: 'Elektronik-graf — bilder + modelldistraktorer', href: '/elektronik-demo' },
  ];

  // LIVE review queues (a count that self-sinks when done) + the broken-question log.
  const live: Surface[] = [
    { icon: '🔊', label: 'Ljud (stavningsklipp)', href: '/stava/granska/ljud', kvar: audioKvar },
    { icon: '🖼️', label: 'Bilder (engelska + storlek/verb)', href: '/stava/granska-bilder', kvar: imageKvar },
    { icon: '🐛', label: 'Trasiga frågor (fel/idk-logg)', href: '/stava/fragor' },
    { icon: '🔑', label: 'Aktiveringsflöde (test)', href: '/aktivera/test' },
  ];
  // (Removed as already vetted: 🍕 Modell/pizza and 🔤 Ordstege — reachable again on request.)

  const rank = (s: Surface) => (s.kvar === undefined ? 1 : s.kvar > 0 ? 0 : 2);
  live.sort((a, b) => rank(a) - rank(b));

  const Row = (s: Surface) => {
    const done = s.kvar === 0;
    const status = s.kvar === undefined ? 'öppna →' : done ? '✓ klart' : `${s.kvar} kvar`;
    return (
      <a key={s.href} href={s.href} className={`granska-hub-row ${done ? 'done' : ''}`}>
        <span className="granska-hub-icon"><Emoji e={s.icon} /></span>
        <span className="granska-hub-label">{s.label}</span>
        <span className={`granska-hub-status ${s.kvar && s.kvar > 0 ? 'kvar' : ''}`}>{status}</span>
      </a>
    );
  };

  return (
    <div className="granska">
      <h1>Granska</h1>
      <p className="granska-hint">Allt som ska granskas på ett ställe. Siffran visar hur många som är kvar.</p>

      <h2 style={{ fontSize: '1.05rem', margin: '1rem 0 0.4rem' }}>Elektronik</h2>
      <div className="granska-hub">{elec.map(Row)}</div>

      <h2 style={{ fontSize: '1.05rem', margin: '1.4rem 0 0.4rem' }}>Övrigt</h2>
      <div className="granska-hub">{live.map(Row)}</div>
    </div>
  );
}
