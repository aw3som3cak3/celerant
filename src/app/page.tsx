'use client';

import { useEffect, useState } from 'react';
import { getJSON, postJSON } from '@/lib/client';
import { familyIcons, BY_KEY } from '@/icons';
import { IconGrid } from './_components/IconGrid';
import { PinPad } from './_components/PinPad';
import { TopBar } from './_components/TopBar';
import { useI18n } from './_components/LocaleProvider';

const CACHE_KEY = 'celerant.family';

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

type Player = { id: string; icon: string; schoolYear: number };
type Goal = { label: string; target: number; reached: boolean; progress: number };
type Me = { authenticated: boolean; parent?: boolean; icons?: string[]; players?: Player[]; goal?: Goal | null };
type Families = { pairs: string[]; empty: boolean };

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [families, setFamilies] = useState<Families | null>(null);
  const [mode, setMode] = useState<'login' | 'create' | 'addplayer'>('login');

  useEffect(() => {
    getJSON<Me>('/api/me').then(setMe);
    getJSON<Families>('/api/families').then(setFamilies);
  }, []);

  if (!me || !families) return <div className="plain muted">…</div>;

  if (me.authenticated) return <Players me={me} />;

  return (
    <>
      <TopBar onLogin={() => setMode('login')} />
      {mode === 'create' ? (
        <CreateFamily onDone={() => location.reload()} onBack={() => setMode('login')} />
      ) : (
        <LoginCard pairs={families.pairs} onCreate={() => setMode('create')} />
      )}
    </>
  );
}

// --- login card ------------------------------------------------------------

function LoginCard({ pairs, onCreate }: { pairs: string[]; onCreate: () => void }) {
  const { t } = useI18n();
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [modalSlot, setModalSlot] = useState<'a' | 'b' | null>(null);
  const [err, setErr] = useState('');

  const both = a && b;
  // Device history first (localStorage, most-recent first), then any other
  // families that live on this server (§5.1 — a home server may be opened from a
  // fresh browser with no history). Deduped; history order wins. We do NOT hide a
  // remembered pair just because the server list is momentarily empty — that is
  // exactly the "log in with one of these" shortcut the user expects to see.
  const history = readCached();
  const seen = new Set(history);
  const chips = [...history, ...pairs.filter((p) => !seen.has(p))];

  function pick(key: string) {
    setErr('');
    if (modalSlot === 'a') setA(key);
    else if (modalSlot === 'b') setB(key);
    setModalSlot(null);
  }

  async function submit(pin: string) {
    if (!a || !b) return;
    setErr('');
    const iconPair = `${a}+${b}`; // entered order; the server matches either way
    const r = await postJSON<{ ok?: boolean; iconPair?: string }>('/api/login', { iconPair, pin });
    if (r.ok) {
      rememberFamily(r.iconPair ?? iconPair); // remember the family's canonical order
      location.reload();
    } else setErr(t('login.error'));
  }

  function chooseCached(pair: string) {
    const [x, y] = pair.split('+');
    setErr('');
    setA(x);
    setB(y);
  }

  return (
    <div className="login-card">
      <h1 style={{ marginTop: 0 }}>{t('login.title')}</h1>
      <p className="muted" style={{ marginTop: '-0.4rem' }}>{t('login.pickTwo')}</p>

      <div className="slot-row">
        <Slot value={a} onClick={() => setModalSlot('a')} />
        <Slot value={b} onClick={() => setModalSlot('b')} />
      </div>

      {both ? (
        <>
          <PinPad label={t('login.pin')} onComplete={submit} />
          {err && <p className="muted">{err}</p>}
          <button className="idk" onClick={() => { setA(null); setB(null); setErr(''); }}>{t('login.restart')}</button>
        </>
      ) : (
        <p className="muted" style={{ fontSize: '0.85rem' }}>{t('login.pressPlus')}</p>
      )}

      {chips.length > 0 && !both && (
        <>
          <div className="login-divider">{t('login.orCached')}</div>
          <div className="cached-row">
            {chips.map((p) => (
              <button key={p} className="family-chip" onClick={() => chooseCached(p)} title={t('nav.login')}>
                {familyIcons(p).map((i) => i.glyph).join(' ')}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="or-divider">{t('common.or')}</div>
      <button className="primary" onClick={onCreate}>{t('login.newFamily')}</button>

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
  const { t } = useI18n();
  return (
    <button className={`slot ${value ? 'filled' : ''}`} onClick={onClick} aria-label={value ? t('slot.change') : t('slot.choose')}>
      {value ? BY_KEY.get(value)?.glyph : '+'}
    </button>
  );
}

function IconModal({ exclude, onClose, onPick }: { exclude: Set<string>; onClose: () => void; onPick: (k: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{t('modal.pickIcon')}</strong>
          <button className="idk" onClick={onClose}>{t('common.close')}</button>
        </div>
        <IconGrid allowSearch exclude={exclude} onPick={onPick} />
      </div>
    </div>
  );
}

// --- logged in: the children card -------------------------------------------

function Players({ me }: { me: Me }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [changing, setChanging] = useState<Player | null>(null);
  return (
    <>
      <TopBar authed />
      <div className="family-card">
        <h2>{t('family.heading')}</h2>
        <div className="bigpair" style={{ margin: '0.4rem 0' }}>{me.icons!.join(' ')}</div>
        {me.goal && (
          <div className="goal-chip">
            <div>
              🎯 {me.goal.label} · {me.goal.progress}/{me.goal.target}{me.goal.reached ? ' 🎉' : ''}
            </div>
            <div className="sessionbar">
              <span style={{ width: `${Math.min(100, Math.round((me.goal.progress / me.goal.target) * 100))}%` }} />
            </div>
          </div>
        )}

        <div className="or-divider">{editing ? t('players.pickToChange') : t('family.children')}</div>

        <div className="children-grid">
          {me.players!.map((p) => (
            // In edit mode a tap opens the icon picker for THAT child; otherwise it
            // starts their session. No grade on the tile (fix-grade-source-of-truth §2).
            <button
              key={p.id}
              className={`child-tile ${editing ? 'editing' : ''}`}
              title={BY_KEY.get(p.icon)?.name}
              onClick={() => (editing ? setChanging(p) : (location.href = `/practice?p=${p.id}`))}
            >
              {BY_KEY.get(p.icon)?.glyph ?? '?'}
              {editing && <span className="tile-edit">✏️</span>}
            </button>
          ))}
          {!editing && (
            <button className="child-tile add" onClick={() => setAdding(true)} aria-label={t('players.addChild')}>
              +
            </button>
          )}
        </div>

        <div className="family-actions">
          {/* The shared cat room — a real button, not a faint link. */}
          <a className="room-btn" href="/room">🐱 {t('room.title')}</a>
          {/* Kids change their own icon right here, where they see them. */}
          <button className="pill-btn" onClick={() => setEditing((e) => !e)}>
            {editing ? t('common.done') : `✏️ ${t('players.changeIcon')}`}
          </button>
        </div>
      </div>
      {adding && <AddChildModal used={me.players!.map((p) => p.icon)} onClose={() => setAdding(false)} />}
      {changing && (
        <ChangeIconModal
          player={changing}
          used={me.players!.filter((x) => x.id !== changing.id).map((x) => x.icon)}
          onClose={() => setChanging(null)}
        />
      )}
    </>
  );
}

// A child changes their OWN icon from the family screen (ui-lifecycle §5.2): no PIN,
// just pick a new one. Icons taken by siblings are absent; their θ, cards and map
// are keyed on player_id, so they follow the child across the change untouched.
function ChangeIconModal({ player, used, onClose }: { player: Player; used: string[]; onClose: () => void }) {
  const { t } = useI18n();
  const [err, setErr] = useState('');

  async function change(icon: string) {
    const r = await postJSON<{ ok?: boolean; error?: string }>('/api/player/icon', { playerId: player.id, icon });
    if (r.ok) location.reload();
    else setErr(t('player.iconTaken'));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{BY_KEY.get(player.icon)?.glyph} {t('players.changeIcon')}</strong>
          <button className="idk" onClick={onClose}>{t('common.close')}</button>
        </div>
        <IconGrid allowSearch exclude={new Set(used)} onPick={change} />
        {err && <p className="muted">{err}</p>}
      </div>
    </div>
  );
}

// Add a child from the family card: pick an icon and that's it. The child never
// declares a grade (start-from-below §3); the app starts easy and climbs. A parent
// can set a grade later, privately, in the parent view — a weak hint only.
function AddChildModal({ used, onClose }: { used: string[]; onClose: () => void }) {
  const { t } = useI18n();
  const [err, setErr] = useState('');

  async function create(icon: string) {
    const r = await postJSON<{ ok?: boolean; error?: string }>('/api/player', { icon });
    if (r.ok) location.reload();
    else setErr(t('player.iconTaken'));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{t('players.addChild')}</strong>
          <button className="idk" onClick={onClose}>{t('common.close')}</button>
        </div>
        <IconGrid allowSearch exclude={new Set(used)} onPick={create} />
        {err && <p className="muted">{err}</p>}
      </div>
    </div>
  );
}

// --- create family ---------------------------------------------------------

function CreateFamily({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { t } = useI18n();
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [parentPin, setParentPin] = useState<string | null>(null);
  const [err, setErr] = useState('');

  if (!a || !b) {
    return (
      <div className="plain">
        <h1>{!a ? t('create.firstIcon') : t('create.secondIcon')}</h1>
        <p className="muted">
          {t('create.familyIsTwo')}{' '}
          <button className="idk" onClick={a ? () => setA(null) : onBack}>{t('common.back')}</button>
        </p>
        {a && <div className="bigpair">{BY_KEY.get(a)?.glyph}</div>}
        <IconGrid allowSearch exclude={a ? new Set([a]) : undefined} onPick={(k) => (a ? setB(k) : setA(k))} selected={a ? [a] : []} />
      </div>
    );
  }

  if (!pin) {
    // key: distinct instance per challenge, so the "confirm" state never leaks
    // from the family PIN into the parent PIN.
    return <ConfirmPin key="family-pin" title={t('create.familyPin')} hint={t('create.familyPinHint')} onDone={setPin} />;
  }
  if (!parentPin) {
    return (
      <ConfirmPin
        key="parent-pin"
        title={t('create.parentPin')}
        hint={t('create.parentPinHint')}
        onDone={async (pp) => {
          setErr('');
          if (pp === pin) return setErr(t('create.pinsMustDiffer'));
          const r = await postJSON<{ ok?: boolean; error?: string; iconPair?: string }>('/api/family', { iconA: a, iconB: b, pin, parentPin: pp });
          if (r.ok) {
            if (r.iconPair) rememberFamily(r.iconPair); // cache the new family for quick login
            setParentPin(pp);
          } else setErr(r.error === 'pair_taken' ? t('create.pairTaken') : r.error === 'weak_pin' ? t('create.weakPin') : t('create.somethingWrong'));
        }}
      />
    );
  }

  return <CreatePlayer used={[]} onDone={onDone} firstTime />;
}

function ConfirmPin({ title, hint, onDone }: { title: string; hint: string; onDone: (pin: string) => void }) {
  const { t } = useI18n();
  const [first, setFirst] = useState<string | null>(null);
  const [err, setErr] = useState('');
  return (
    <div className="plain" style={{ textAlign: 'center' }}>
      <h1>{title}</h1>
      <p className="muted">{hint}</p>
      <PinPad
        label={first ? t('pin.again') : t('pin.four')}
        onComplete={(p) => {
          if (!first) setFirst(p);
          else if (p === first) onDone(p);
          else {
            setErr(t('pin.noMatch'));
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
  const { t } = useI18n();
  const [err, setErr] = useState('');

  // Icon only — no grade (start-from-below §3). Straight to the first easy problem.
  async function create(icon: string) {
    const r = await postJSON<{ ok?: boolean; playerId?: string; error?: string }>('/api/player', { icon });
    if (r.ok && r.playerId) location.href = `/practice?p=${r.playerId}`;
    else setErr(t('player.iconTaken'));
  }

  return (
    <div className="plain">
      <h1>{firstTime ? t('player.firstIcon') : t('player.pickIcon')}</h1>
      <IconGrid exclude={new Set(used)} onPick={create} />
      {err && <p className="muted">{err}</p>}
    </div>
  );
}
