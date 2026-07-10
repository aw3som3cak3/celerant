'use client';

import { useEffect, useState } from 'react';
import { getJSON, postJSON } from '@/lib/client';
import { familyIcons, BY_KEY } from '@/icons';
import { IconGrid } from './_components/IconGrid';
import { PinPad } from './_components/PinPad';

type Me = { authenticated: boolean; parent?: boolean; icons?: string[]; players?: { id: string; icon: string; schoolYear: number }[] };
type Families = { pairs: string[]; empty: boolean };

const CACHE_KEY = 'celerant.family';

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [families, setFamilies] = useState<Families | null>(null);
  const [mode, setMode] = useState<'landing' | 'login' | 'create' | 'addplayer'>('landing');

  useEffect(() => {
    getJSON<Me>('/api/me').then(setMe);
    getJSON<Families>('/api/families').then(setFamilies);
  }, []);

  if (!me || !families) return <div className="plain muted">…</div>;

  if (me.authenticated) {
    if (mode === 'addplayer') return <CreatePlayer used={me.players!.map((p) => p.icon)} onDone={() => location.reload()} />;
    return <Players me={me} onAdd={() => setMode('addplayer')} />;
  }

  if (mode === 'create') return <CreateFamily onDone={() => location.reload()} onBack={() => setMode('landing')} />;
  if (mode === 'login') return <Login pairs={families.pairs} onBack={() => setMode('landing')} />;
  return (
    <Landing
      pairs={families.pairs}
      empty={families.empty}
      onLogin={() => setMode('login')}
      onCreate={() => setMode('create')}
    />
  );
}

// --- landing: log in or register ------------------------------------------

function Landing({
  pairs,
  empty,
  onLogin,
  onCreate,
}: {
  pairs: string[];
  empty: boolean;
  onLogin: () => void;
  onCreate: () => void;
}) {
  // Surface the family last used on this device, if it still exists.
  const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
  const cachedOk = cached && pairs.includes(cached) ? cached : null;

  return (
    <div className="plain" style={{ textAlign: 'center' }}>
      <h1>Celerant</h1>
      {cachedOk && (
        <>
          <p className="muted">Fortsätt som</p>
          <button className="namebtn" style={{ fontSize: '2rem', textAlign: 'center' }} onClick={onLogin}>
            {familyIcons(cachedOk).map((i) => i.glyph).join(' ')}
          </button>
        </>
      )}
      <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        {!empty && (
          <button className="primary" onClick={onLogin}>
            Logga in
          </button>
        )}
        <button className={empty ? 'primary' : 'namebtn'} style={empty ? undefined : { padding: '0.7rem 1.4rem' }} onClick={onCreate}>
          Ny familj
        </button>
      </div>
      {empty && <p className="muted" style={{ marginTop: '1rem' }}>Ingen familj än — skapa en för att börja.</p>}
    </div>
  );
}

// --- logged in: pick a player ----------------------------------------------

function Players({ me, onAdd }: { me: Me; onAdd: () => void }) {
  return (
    <div className="plain" style={{ textAlign: 'center' }}>
      <div className="bigpair">{me.icons!.join(' ')}</div>
      <div className="playergrid">
        {me.players!.map((p) => (
          <button key={p.id} className="playerbtn" title={BY_KEY.get(p.icon)?.name} onClick={() => (location.href = `/practice?p=${p.id}`)}>
            {BY_KEY.get(p.icon)?.glyph ?? '?'}
          </button>
        ))}
        <button className="playerbtn" style={{ fontSize: '2rem', color: 'var(--faint)' }} onClick={onAdd}>
          +
        </button>
      </div>
      <p>
        <a className="idk" href="/parent">
          förälder
        </a>{' '}
        ·{' '}
        <button
          className="idk"
          onClick={async () => {
            await postJSON('/api/logout', {});
            localStorage.removeItem(CACHE_KEY);
            location.reload();
          }}
        >
          byt familj
        </button>
      </p>
    </div>
  );
}

// --- family login ----------------------------------------------------------

function Login({ pairs, onBack }: { pairs: string[]; onBack: () => void }) {
  const [pair, setPair] = useState<string | null>(() => (typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null));
  const [err, setErr] = useState('');

  // Only offer the cached pair if it still exists.
  const cached = pair && pairs.includes(pair) ? pair : null;

  async function submit(pin: string) {
    if (!pair) return;
    setErr('');
    const r = await postJSON<{ ok?: boolean }>('/api/login', { iconPair: pair, pin });
    if (r.ok) {
      localStorage.setItem(CACHE_KEY, pair);
      location.reload();
    } else setErr('Fel PIN.');
  }

  if (cached && pair) {
    const [a, b] = familyIcons(cached);
    return (
      <div className="plain" style={{ textAlign: 'center' }}>
        <div className="bigpair">{a.glyph} {b.glyph}</div>
        <PinPad label="Skriv PIN" onComplete={submit} />
        {err && <p className="muted">{err}</p>}
        <button className="idk" onClick={() => { localStorage.removeItem(CACHE_KEY); setPair(null); }}>
          byt familj
        </button>
      </div>
    );
  }

  if (pair) {
    const [a, b] = familyIcons(pair);
    return (
      <div className="plain" style={{ textAlign: 'center' }}>
        <div className="bigpair">{a.glyph} {b.glyph}</div>
        <PinPad label="Skriv PIN" onComplete={submit} />
        {err && <p className="muted">{err}</p>}
        <button className="idk" onClick={() => setPair(null)}>annan familj</button>
      </div>
    );
  }

  return (
    <div className="plain">
      <h1>Vilken familj?</h1>
      <div className="playergrid">
        {pairs.map((p) => {
          const [a, b] = familyIcons(p);
          return (
            <button key={p} className="playerbtn" style={{ fontSize: '1.8rem' }} onClick={() => setPair(p)}>
              {a.glyph}
              {b.glyph}
            </button>
          );
        })}
      </div>
      <button className="idk" onClick={onBack}>tillbaka</button>
    </div>
  );
}

// --- create family ---------------------------------------------------------

function CreateFamily({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [parentPin, setParentPin] = useState<string | null>(null);
  const [err, setErr] = useState('');

  if (!a || !b) {
    return (
      <div className="plain">
        <h1>{!a ? 'Välj första ikonen' : 'Välj andra ikonen'}</h1>
        <p className="muted">
          En familj är två ikoner — t.ex. räven och varmkorven.{' '}
          <button className="idk" onClick={a ? () => setA(null) : onBack}>tillbaka</button>
        </p>
        {a && <div className="bigpair">{BY_KEY.get(a)?.glyph}</div>}
        <IconGrid allowSearch exclude={a ? new Set([a]) : undefined} onPick={(k) => (a ? setB(k) : setA(k))} selected={a ? [a] : []} />
      </div>
    );
  }

  if (!pin) {
    return (
      <ConfirmPin
        title="Familjens PIN"
        hint="Barnen kommer att kunna den."
        onDone={setPin}
        onBad={() => setErr('')}
      />
    );
  }
  if (!parentPin) {
    return (
      <ConfirmPin
        title="Förälderns PIN"
        hint="Måste skilja sig från familjens PIN. Barnen ska inte kunna den."
        onDone={async (pp) => {
          setErr('');
          if (pp === pin) return setErr('Förälderns PIN måste skilja sig.');
          const r = await postJSON<{ ok?: boolean; error?: string }>('/api/family', { iconA: a, iconB: b, pin, parentPin: pp });
          if (r.ok) setParentPin(pp);
          else setErr(r.error === 'pair_taken' ? 'Paret är taget.' : r.error === 'weak_pin' ? 'För enkel PIN (inga 1111 eller 1234).' : 'Något blev fel.');
        }}
      />
    );
  }

  // parentPin is set, family + entry session exist: create the first player.
  return <CreatePlayer used={[]} onDone={onDone} firstTime />;
}

function ConfirmPin({ title, hint, onDone }: { title: string; hint: string; onDone: (pin: string) => void; onBad?: () => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [err, setErr] = useState('');
  return (
    <div className="plain" style={{ textAlign: 'center' }}>
      <h1>{title}</h1>
      <p className="muted">{hint}</p>
      <PinPad
        label={first ? 'Skriv igen' : 'Fyra siffror'}
        onComplete={(p) => {
          if (!first) setFirst(p);
          else if (p === first) onDone(p);
          else {
            setErr('Matchade inte, försök igen.');
            setFirst(null);
          }
        }}
      />
      {err && <p className="muted">{err}</p>}
    </div>
  );
}

// --- create player ---------------------------------------------------------

function CreatePlayer({ used, onDone, firstTime }: { used: string[]; onDone: () => void; firstTime?: boolean }) {
  const [icon, setIcon] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [err, setErr] = useState('');

  async function create(y: number) {
    if (!icon) return;
    const r = await postJSON<{ ok?: boolean; playerId?: string; error?: string }>('/api/player', { icon, schoolYear: y });
    if (r.ok && r.playerId) location.href = `/practice?p=${r.playerId}`;
    else setErr('Ikonen är tagen — välj en annan.');
  }

  if (!icon) {
    return (
      <div className="plain">
        <h1>{firstTime ? 'Nu barnet: välj en ikon' : 'Välj en ikon'}</h1>
        <IconGrid exclude={new Set(used)} onPick={setIcon} />
      </div>
    );
  }
  return (
    <div className="plain" style={{ textAlign: 'center' }}>
      <div className="bigpair">{BY_KEY.get(icon)?.glyph}</div>
      <h1>Vilken årskurs?</h1>
      <p className="muted">Inte ålder — årskurs. F är förskoleklass.</p>
      <div className="yearrow">
        {['F', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((y, i) => (
          <button key={y} className={`yearbtn ${year === i ? 'on' : ''}`} onClick={() => { setYear(i); create(i); }}>
            {y}
          </button>
        ))}
      </div>
      {err && <p className="muted">{err}</p>}
    </div>
  );
}
