'use client';

import { useEffect, useState } from 'react';
import { getJSON, postJSON } from '@/lib/client';
import { familyIcons, familyKey, BY_KEY } from '@/icons';
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

type Me = { authenticated: boolean; parent?: boolean; icons?: string[]; players?: { id: string; icon: string; schoolYear: number }[] };
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

  if (me.authenticated) {
    if (mode === 'addplayer') return <CreatePlayer used={me.players!.map((p) => p.icon)} onDone={() => location.reload()} />;
    return <Players me={me} onAdd={() => setMode('addplayer')} />;
  }

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

      {cached.length > 0 && !both && (
        <>
          <div className="login-divider">{t('login.orCached')}</div>
          <div className="cached-row">
            {cached.map((p) => (
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

// --- logged in: pick a player ----------------------------------------------

function Players({ me, onAdd }: { me: Me; onAdd: () => void }) {
  const { t } = useI18n();
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
        <a className="idk" href="/parent">{t('players.parent')}</a>{' '}
        ·{' '}
        <button
          className="idk"
          onClick={async () => {
            await postJSON('/api/logout', {});
            location.reload(); // keep the cached-families list for quick re-login
          }}
        >
          {t('players.switch')}
        </button>
      </p>
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
    return <ConfirmPin title={t('create.familyPin')} hint={t('create.familyPinHint')} onDone={setPin} />;
  }
  if (!parentPin) {
    return (
      <ConfirmPin
        title={t('create.parentPin')}
        hint={t('create.parentPinHint')}
        onDone={async (pp) => {
          setErr('');
          if (pp === pin) return setErr(t('create.pinsMustDiffer'));
          const r = await postJSON<{ ok?: boolean; error?: string }>('/api/family', { iconA: a, iconB: b, pin, parentPin: pp });
          if (r.ok) setParentPin(pp);
          else setErr(r.error === 'pair_taken' ? t('create.pairTaken') : r.error === 'weak_pin' ? t('create.weakPin') : t('create.somethingWrong'));
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
  const [icon, setIcon] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [err, setErr] = useState('');

  async function create(y: number) {
    if (!icon) return;
    const r = await postJSON<{ ok?: boolean; playerId?: string; error?: string }>('/api/player', { icon, schoolYear: y });
    if (r.ok && r.playerId) location.href = `/practice?p=${r.playerId}`;
    else setErr(t('player.iconTaken'));
  }

  if (!icon) {
    return (
      <div className="plain">
        <h1>{firstTime ? t('player.firstIcon') : t('player.pickIcon')}</h1>
        <IconGrid exclude={new Set(used)} onPick={setIcon} />
      </div>
    );
  }
  return (
    <div className="plain" style={{ textAlign: 'center' }}>
      <div className="bigpair">{BY_KEY.get(icon)?.glyph}</div>
      <h1>{t('player.whichYear')}</h1>
      <p className="muted">{t('player.yearHint')}</p>
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
