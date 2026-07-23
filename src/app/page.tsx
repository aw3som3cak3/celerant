'use client';

import { useEffect, useState } from 'react';
import { getJSON, postJSON } from '@/lib/client';
import { familyIcons, BY_KEY } from '@/icons';
import { IconGrid } from './_components/IconGrid';
import { PinPad } from './_components/PinPad';
import { TopBar } from './_components/TopBar';
import { EmojiIcon } from './_components/Icon';
import { Emoji } from './_components/Emoji';
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

type Player = { id: string; icon: string; schoolYear: number; canSprint?: boolean; hasDiplomas?: boolean; needsToolTest?: boolean; canGround?: boolean; groundFirst?: boolean };
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
                {familyIcons(p).map((i) => <EmojiIcon key={i.key} iconKey={i.key} />)}
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
      {value ? <EmojiIcon iconKey={value} /> : '+'}
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
  const [editing, setEditing] = useState(false);
  const [changing, setChanging] = useState<Player | null>(null);
  const [sprinting, setSprinting] = useState<Player | null>(null);
  return (
    <>
      <TopBar authed />
      <div className="family-card">
        <h2>{t('family.heading')}</h2>
        <div className="bigpair" style={{ margin: '0.4rem 0' }}>{me.icons!.map((k) => <EmojiIcon key={k} iconKey={k} />)}</div>
        {me.goal && (
          <div className="goal-chip">
            <div>
              <Emoji e="🎯" /> {me.goal.label} · {me.goal.progress}/{me.goal.target}{me.goal.reached ? <> <Emoji e="🎉" /></> : ''}
            </div>
            <div className="sessionbar">
              <span style={{ width: `${Math.min(100, Math.round((me.goal.progress / me.goal.target) * 100))}%` }} />
            </div>
          </div>
        )}

        <div className="or-divider">{editing ? t('players.pickToChange') : t('family.children')}</div>

        <div className="children-grid">
          {me.players!.map((p) => (
            // In edit mode a tap opens the icon picker for THAT child. Otherwise it
            // starts their session — unless the child has a skill in the fluency-
            // building band (canSprint), in which case a tap offers the choice of a
            // normal session OR a ⚡ sprint (a victory lap they can reach for, never
            // forced). No grade on the tile (fix-grade-source-of-truth §2).
            <button
              key={p.id}
              className={`child-tile ${editing ? 'editing' : ''}`}
              title={BY_KEY.get(p.icon)?.name}
              // A beginner still before add-within-10 goes STRAIGHT into Explore — it's
              // the only step for her; there is no separate Practice yet. Once she's
              // climbed the ladder, groundFirst drops and the normal menu returns.
              onClick={() =>
                editing
                  ? setChanging(p)
                  : p.groundFirst
                    ? (location.href = `/ground?p=${p.id}`)
                    : p.canSprint || p.hasDiplomas || p.needsToolTest || p.canGround
                      ? setSprinting(p)
                      : (location.href = `/practice?p=${p.id}`)
              }
            >
              <EmojiIcon iconKey={p.icon} />
              {editing && <span className="tile-edit"><Emoji e="✏️" /></span>}
              {!editing && p.groundFirst && <span className="tile-ground" aria-hidden><Emoji e="🌱" /></span>}
              {!editing && !p.groundFirst && (p.canSprint || p.needsToolTest) && <span className="tile-zap" aria-hidden><Emoji e="⚡" /></span>}
            </button>
          ))}
          {/* Adding a child is a PARENT action — it lives in the parent view, not
              on this shared screen the kids see. */}
        </div>

        <div className="family-actions">
          {/* The shared cat room — a real button, not a faint link. */}
          <a className="room-btn" href="/room"><Emoji e="🐱" /> {t('room.title')}</a>
          {/* Kids change their own icon right here, where they see them. */}
          <button className="pill-btn" onClick={() => setEditing((e) => !e)}>
            {editing ? t('common.done') : <><Emoji e="✏️" /> {t('players.changeIcon')}</>}
          </button>
        </div>
      </div>
      {changing && (
        <ChangeIconModal
          player={changing}
          used={me.players!.filter((x) => x.id !== changing.id).map((x) => x.icon)}
          onClose={() => setChanging(null)}
        />
      )}
      {sprinting && <SprintChoiceModal player={sprinting} onClose={() => setSprinting(null)} />}
    </>
  );
}

// A child taps their icon and gets their own little screen of choices: always
// practice (the primary, larger action); a ⚡ sprint if a skill is in the fluency-
// building band; their diplomas if any; and — at most once a day, until a few are
// gathered — a warm one-off invitation to run the writing-speed test, which grounds
// their fluency aims in a real hand speed. None is ever forced. (celerant sprint-
// reward / tool-test wiring)
function SprintChoiceModal({ player, onClose }: { player: Player; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="bigpair" style={{ margin: '0.2rem 0 1rem' }}><EmojiIcon iconKey={player.icon} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {/* A groundFirst beginner never reaches this modal — she goes straight to
              Explore. So Practice is simply the primary for everyone who does. */}
          <a className="primary" href={`/practice?p=${player.id}`} style={{ margin: 0, fontSize: '1.15rem', padding: '0.9rem' }}>{t('home.startPractice')}</a>
          {/* Speed run. When the once-a-day writing-speed measure is due, it IS the
              first speed run of the day: route through it, then flow into the real
              sprint (then=1) if one is waiting. No separate "help the app" door. */}
          {(player.canSprint || player.needsToolTest) && (
            <a
              className="next-btn"
              href={player.needsToolTest ? `/warmup?p=${player.id}${player.canSprint ? '&then=1' : ''}` : `/sprint?p=${player.id}`}
              style={{ margin: 0, fontSize: '1.15rem', padding: '0.9rem' }}
            >
              <Emoji e="⚡" /> {t('home.startSprint')}
            </a>
          )}
          {player.hasDiplomas && (
            <a className="next-btn" href={`/shelf?p=${player.id}`} style={{ margin: 0 }}><Emoji e="🏅" /> {t('home.diplomas')}</a>
          )}
          {/* The quiet GROUND door — for a young kid who's PAST the beginner routing
              (climbed the ladder / fluent) but may still want to replay Explore. A
              groundFirst beginner never reaches this modal (she goes straight in). */}
          {player.canGround && (
            <a className="next-btn" href={`/ground?p=${player.id}`} style={{ margin: 0 }}><Emoji e="🌱" /> {t('home.ground')}</a>
          )}
          <button className="idk" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
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
          <strong><EmojiIcon iconKey={player.icon} /> {t('players.changeIcon')}</strong>
          <button className="idk" onClick={onClose}>{t('common.close')}</button>
        </div>
        <IconGrid allowSearch exclude={new Set(used)} onPick={change} />
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
        {a && <div className="bigpair"><EmojiIcon iconKey={a} /></div>}
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
