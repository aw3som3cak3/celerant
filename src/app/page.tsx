'use client';

import { useEffect, useState } from 'react';
import { getJSON, postJSON } from '@/lib/client';
import { familyIcons, familyKey, BY_KEY } from '@/icons';
import { IconGrid } from './_components/IconGrid';
import { PinPad } from './_components/PinPad';

// Families used on THIS device, most-recent first — for quick login.
function readCached(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
  } catch {
    return [];
  }
}
function rememberFamily(pair: string): void {
  const list = [pair, ...readCached().filter((p) => p !== pair)].slice(0, 8);
  localStorage.setItem(CACHE_KEY, JSON.stringify(list));
}

type Me = { authenticated: boolean; parent?: boolean; icons?: string[]; players?: { id: string; icon: string; schoolYear: number }[] };
type Families = { pairs: string[]; empty: boolean };

const CACHE_KEY = 'celerant.family';

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [families, setFamilies] = useState<Families | null>(null);
  const [mode, setMode] = useState<'login' | 'create' | 'addplayer'>('login');

  useEffect(() => {
    getJSON<Me>('/api/me').then(setMe);
    getJSON<Families>('/api/families').then(setFamilies);
  }, []);

  if (!me || !families) return <div className="plain muted">…</div>;

  if (me.authenticated) {
    if (mode === 'addplayer') return <CreatePlayer used={me.players!.map((p) => p.icon)} onDone={() => location.reload()} />;
    return <Players me={me} onAdd={() => setMode('addplayer')} />;
  }

  if (mode === 'create') return <CreateFamily onDone={() => location.reload()} onBack={() => setMode('login')} />;
  return <LoginCard pairs={families.pairs} onCreate={() => setMode('create')} />;
}

// --- login card ------------------------------------------------------------

function LoginCard({ pairs, onCreate }: { pairs: string[]; onCreate: () => void }) {
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [modalSlot, setModalSlot] = useState<'a' | 'b' | null>(null);
  const [err, setErr] = useState('');

  const both = a && b;
  // Only offer cached families that still exist.
  const cached = readCached().filter((p) => pairs.includes(p));

  function pick(key: string) {
    setErr('');
    if (modalSlot === 'a') setA(key);
    else if (modalSlot === 'b') setB(key);
    setModalSlot(null);
  }

  async function submit(pin: string) {
    if (!a || !b) return;
    setErr('');
    const iconPair = familyKey(a, b);
    const r = await postJSON<{ ok?: boolean }>('/api/login', { iconPair, pin });
    if (r.ok) {
      rememberFamily(iconPair);
      location.reload();
    } else setErr('Fel — kontrollera ikonerna och PIN.');
  }

  function chooseCached(pair: string) {
    const [x, y] = pair.split('+');
    setErr('');
    setA(x);
    setB(y);
  }

  return (
    <div className="login-card">
      <h1 style={{ marginTop: 0 }}>Logga in</h1>
      <p className="muted" style={{ marginTop: '-0.4rem' }}>Välj familjens två ikoner</p>

      <div className="slot-row">
        <Slot value={a} onClick={() => setModalSlot('a')} />
        <Slot value={b} onClick={() => setModalSlot('b')} />
      </div>

      {both ? (
        <>
          <PinPad label="Skriv PIN" onComplete={submit} />
          {err && <p className="muted">{err}</p>}
          <button className="idk" onClick={() => { setA(null); setB(null); setErr(''); }}>börja om</button>
        </>
      ) : (
        <p className="muted" style={{ fontSize: '0.85rem' }}>Tryck på + för att välja en ikon.</p>
      )}

      {cached.length > 0 && !both && (
        <>
          <div className="login-divider">eller logga in med en av dessa</div>
          <div className="cached-row">
            {cached.map((p) => (
              <button key={p} className="family-chip" onClick={() => chooseCached(p)} title="logga in">
                {familyIcons(p).map((i) => i.glyph).join(' ')}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: '1.8rem' }}>
        <button className="primary" onClick={onCreate}>Ny familj</button>
      </div>

      {modalSlot && (
        <IconModal
          exclude={new Set([a, b].filter(Boolean) as string[])}
          onClose={() => setModalSlot(null)}
          onPick={pick}
        />
      )}
    </div>
  );
}

function Slot({ value, onClick }: { value: string | null; onClick: () => void }) {
  return (
    <button className={`slot ${value ? 'filled' : ''}`} onClick={onClick} aria-label={value ? 'byt ikon' : 'välj ikon'}>
      {value ? BY_KEY.get(value)?.glyph : '+'}
    </button>
  );
}

function IconModal({ exclude, onClose, onPick }: { exclude: Set<string>; onClose: () => void; onPick: (k: string) => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>Välj en ikon</strong>
          <button className="idk" onClick={onClose}>stäng</button>
        </div>
        <IconGrid allowSearch exclude={exclude} onPick={onPick} />
      </div>
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
            location.reload(); // keep the cached-families list for quick re-login
          }}
        >
          byt familj
        </button>
      </p>
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
