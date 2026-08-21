'use client';

// PARENT ACTIVATION page (docs/club-bridge.md §2c). PUBLIC, claimed by the ?t= token alone — no login.
// Calm, parent-facing: recognise your kids, confirm/repick the family + child icons, set the two PINs.
// No points, no streaks, no reward styling — this is the parent's quiet doorway, not a child's game.

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getJSON, postJSON } from '@/lib/client';
import { IconGrid } from '../_components/IconGrid';
import { PinPad } from '../_components/PinPad';
import { EmojiIcon } from '../_components/Icon';

type Child = { playerId: string; icon: string; schoolYear: number; exclude?: string[] };
type Loaded = { ok: boolean; iconPair?: string; children?: Child[] };

function Activate() {
  const token = useSearchParams().get('t') ?? '';
  const [phase, setPhase] = useState<'loading' | 'invalid' | 'form' | 'done'>('loading');

  const [children, setChildren] = useState<Child[]>([]);
  const [famA, setFamA] = useState('');
  const [famB, setFamB] = useState('');
  const [childIcons, setChildIcons] = useState<Record<string, string>>({});
  const [pin, setPin] = useState<string | null>(null);
  const [parentPin, setParentPin] = useState<string | null>(null);
  const [edit, setEdit] = useState<null | { kind: 'famA' } | { kind: 'famB' } | { kind: 'child'; id: string }>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return setPhase('invalid');
    getJSON<Loaded>(`/api/activate?t=${encodeURIComponent(token)}`)
      .then((r) => {
        if (!r?.ok || !r.children) return setPhase('invalid');
        const [a, b] = (r.iconPair ?? '').split('+');
        setFamA(a ?? '');
        setFamB(b ?? '');
        setChildren(r.children);
        setChildIcons(Object.fromEntries(r.children.map((c) => [c.playerId, c.icon])));
        setPhase('form');
      })
      .catch(() => setPhase('invalid'));
  }, [token]);

  if (phase === 'loading') return <div className="plain muted" style={{ textAlign: 'center' }}>…</div>;

  if (phase === 'invalid')
    return (
      <div className="plain" style={{ textAlign: 'center' }}>
        <h1>Aktivera din familj</h1>
        <p className="muted">Länken är ogiltig eller redan använd.</p>
        <p style={{ marginTop: '1.5rem' }}>
          <a className="next-btn" href="/">🏠 Till start</a>
        </p>
      </div>
    );

  if (phase === 'done')
    return (
      <div className="plain" style={{ textAlign: 'center' }}>
        <h1>Klart!</h1>
        <p className="muted">Familjen är aktiverad. Nu loggar ni in med era två familjeikoner och PIN-koden.</p>
        <p style={{ marginTop: '1.5rem' }}>
          <a className="next-btn" href="/">🏠 Till inloggningen</a>
        </p>
      </div>
    );

  // Icons already taken WITHIN the family (so a change never collides with a sibling), unioned — for a
  // child slot — with the icons the server says are taken by OTHER members of this child's groups
  // (docs/groups.md §1), so a repick can't collide across the STEAM-team either.
  const usedByChildren = (exceptId?: string) => {
    const taken = new Set(
      children.filter((c) => c.playerId !== exceptId).map((c) => childIcons[c.playerId]).filter(Boolean),
    );
    const groupTaken = children.find((c) => c.playerId === exceptId)?.exclude ?? [];
    for (const k of groupTaken) taken.add(k);
    return taken;
  };

  // An icon picker overlay for whichever slot is being edited.
  if (edit) {
    const e = edit;
    const exclude =
      e.kind === 'famA' ? new Set([famB]) : e.kind === 'famB' ? new Set([famA]) : usedByChildren(e.id);
    const pick = (k: string) => {
      if (e.kind === 'famA') setFamA(k);
      else if (e.kind === 'famB') setFamB(k);
      else setChildIcons((m) => ({ ...m, [e.id]: k }));
      setEdit(null);
    };
    return (
      <div className="plain">
        <h1>Välj en ikon</h1>
        <p className="muted">
          <button className="idk" onClick={() => setEdit(null)}>Avbryt</button>
        </p>
        <IconGrid allowSearch exclude={exclude} onPick={pick} />
      </div>
    );
  }

  const canSubmit =
    !!famA && !!famB && famA !== famB && pin !== null && parentPin !== null && pin !== parentPin && !busy;

  async function submit() {
    setErr('');
    if (!canSubmit) return;
    setBusy(true);
    const r = await postJSON<{ ok?: boolean; error?: string }>('/api/activate', {
      token,
      pin,
      parentPin,
      iconPair: [famA, famB],
      childIcons: children.map((c) => ({ playerId: c.playerId, icon: childIcons[c.playerId] })),
    }).catch(() => ({ ok: false, error: 'network' as string }));
    setBusy(false);
    if (r?.ok) return setPhase('done');
    setErr(
      r?.error === 'pair_taken'
        ? 'De två familjeikonerna är redan tagna av en annan familj. Välj ett annat par.'
        : r?.error === 'child_icon'
          ? 'Två barn kan inte ha samma ikon. Välj olika ikoner.'
          : r?.error === 'invalid_token'
            ? 'Länken är ogiltig eller redan använd.'
            : 'Något gick fel. Försök igen.',
    );
  }

  return (
    <div className="plain">
      <h1>Aktivera din familj</h1>
      <p className="muted">Känner du igen barnen? Bekräfta ikonerna och välj era PIN-koder, så är ni igång.</p>

      {/* The kids, so the parent recognises the family. */}
      <div className="bigpair" style={{ justifyContent: 'center', gap: '1rem', display: 'flex' }}>
        {children.map((c) => (
          <span key={c.playerId} style={{ textAlign: 'center' }}>
            <EmojiIcon iconKey={childIcons[c.playerId]} />
            <div className="muted" style={{ fontSize: '0.8rem' }}>åk {c.schoolYear}</div>
          </span>
        ))}
      </div>

      {/* Family icons — the login key. */}
      <h2 style={{ fontSize: '1.05rem', margin: '1.4rem 0 0.4rem' }}>Familj-ikoner</h2>
      <p className="muted" style={{ marginTop: 0 }}>De två ikonerna ni loggar in med.</p>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button className="iconbtn sel" onClick={() => setEdit({ kind: 'famA' })} title="ändra"><EmojiIcon iconKey={famA} /></button>
        <button className="iconbtn sel" onClick={() => setEdit({ kind: 'famB' })} title="ändra"><EmojiIcon iconKey={famB} /></button>
        <button className="idk" onClick={() => setEdit({ kind: 'famA' })}>ändra</button>
      </div>

      {/* Each child's icon. */}
      <h2 style={{ fontSize: '1.05rem', margin: '1.4rem 0 0.4rem' }}>Barnens ikoner</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        {children.map((c) => (
          <div key={c.playerId} style={{ textAlign: 'center' }}>
            <button className="iconbtn sel" onClick={() => setEdit({ kind: 'child', id: c.playerId })} title="ändra">
              <EmojiIcon iconKey={childIcons[c.playerId]} />
            </button>
            <div className="muted" style={{ fontSize: '0.8rem' }}>åk {c.schoolYear}</div>
          </div>
        ))}
      </div>

      {/* The two PINs — one pad at a time (avoids a shared physical-keyboard capture). */}
      <h2 style={{ fontSize: '1.05rem', margin: '1.4rem 0 0.4rem' }}>PIN-koder</h2>
      {pin === null ? (
        <PinPad label="Välj barnens PIN (för att logga in)" onComplete={setPin} />
      ) : parentPin === null ? (
        <>
          <p className="muted">Barnens PIN är vald ✓ <button className="idk" onClick={() => setPin(null)}>byt</button></p>
          <PinPad
            label="Välj förälderns PIN (för föräldravyn)"
            onComplete={(p) => {
              if (p === pin) return setErr('Barnens PIN och förälderns PIN måste vara olika.');
              setErr('');
              setParentPin(p);
            }}
          />
        </>
      ) : (
        <p className="muted">
          PIN-koderna är valda ✓{' '}
          <button className="idk" onClick={() => { setPin(null); setParentPin(null); }}>gör om</button>
        </p>
      )}

      {err && <p className="muted" style={{ color: 'var(--danger, #b00)' }}>{err}</p>}

      <p style={{ marginTop: '1.5rem' }}>
        <button className="next-btn" onClick={submit} disabled={!canSubmit}>
          {busy ? 'Aktiverar…' : 'Aktivera familjen'}
        </button>
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="plain muted" style={{ textAlign: 'center' }}>…</div>}>
      <Activate />
    </Suspense>
  );
}
