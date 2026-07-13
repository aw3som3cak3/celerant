'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJSON, postJSON } from '@/lib/client';
import { BY_KEY } from '@/icons';
import { PinPad } from '../_components/PinPad';
import { SkillMap, type MapData } from '../_components/SkillMap';
import { useI18n } from '../_components/LocaleProvider';

type Player = { id: string; icon: string; schoolYear: number; archived: boolean };
type Diagnostic = { code: 'collapse' | 'trivial'; skill: string };
type Transfer = { component: string; beforeMedianMs: number; afterMedianMs: number; nBefore: number; nAfter: number };
type Usage = { weekly: { weekStart: number; sessions: number }[]; lateEveningSessions: number; enTillRate: number; sessionsLast7: number; alarm: boolean };
type Overview = {
  player: { id: string; icon: string; schoolYear: number; sessionTarget: number };
  attemptsLast7Days: number;
  sessionsThisWeek: number;
  diagnostics: Diagnostic[];
  transfer: Transfer[];
  usage: Usage;
  skills: { code: string; year: number; theta: number; mode: string; rate: number | null; rateState: string; aim: number | null }[];
};
type Goal = { goal: { label: string; target: number; reached: boolean } | null; progress: number };
type T = (key: string, params?: Record<string, string | number>) => string;

function fluencyCell(s: Overview['skills'][number], t: T): string {
  if (s.mode !== 'component') return '—';
  if (s.rate == null) return t('parent.fluUnknown');
  const tag = s.rateState === 'measured' ? t('parent.fluMeasured') : t('parent.fluProvisional');
  return `${s.rate.toFixed(0)}${s.aim ? `/${s.aim.toFixed(0)}` : ''} (${tag})`;
}

export default function Parent() {
  const { t } = useI18n();
  const [gate, setGate] = useState<'checking' | 'pin' | 'ok'>('checking');
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [err, setErr] = useState('');

  const loadAll = useCallback(async () => {
    const r = await getJSON<{ players?: Player[]; error?: string }>('/api/parent/players');
    if (r.error) {
      setGate('pin');
      return;
    }
    setPlayers(r.players ?? []);
    setGoal(await getJSON<Goal>('/api/parent/goal'));
    setGate('ok');
  }, []);

  useEffect(() => {
    getJSON<{ authenticated: boolean }>('/api/me').then((me) => {
      if (!me.authenticated) return void (location.href = '/');
      loadAll();
    });
  }, [loadAll]);

  useEffect(() => {
    if (sel) getJSON<Overview>(`/api/parent/overview?playerId=${sel}`).then(setData);
  }, [sel]);

  async function unlock(pin: string) {
    setErr('');
    const r = await postJSON<{ ok?: boolean }>('/api/parent/login', { parentPin: pin });
    if (r.ok) loadAll();
    else setErr(t('parent.wrongPin'));
  }

  if (gate === 'checking') return <div className="plain muted">…</div>;
  if (gate === 'pin')
    return (
      <div className="plain" style={{ textAlign: 'center' }}>
        <h1>{t('parent.title')}</h1>
        <PinPad label={t('parent.pinLabel')} onComplete={unlock} />
        {err && <p className="muted">{err}</p>}
        <a className="idk" href="/">{t('common.back')}</a>
      </div>
    );

  return (
    <div className="plain">
      <h1>{t('parent.overview')}</h1>
      <p className="muted">{t('parent.intro')}</p>

      <FamilyGoal goal={goal} onChange={async () => setGoal(await getJSON<Goal>('/api/parent/goal'))} />

      <div style={{ margin: '1rem 0' }}>
        {players?.filter((p) => !p.archived).map((p) => (
          <button key={p.id} className="idk" style={{ fontSize: '1.6rem', color: sel === p.id ? 'var(--accent)' : undefined }} title={BY_KEY.get(p.icon)?.name} onClick={() => setSel(p.id)}>
            {BY_KEY.get(p.icon)?.glyph}
          </button>
        ))}
      </div>

      {data && (
        <>
          <p className="muted">
            {t('parent.year')} {data.player.schoolYear === 0 ? 'F' : data.player.schoolYear} · {t('parent.attempts7', { n: data.attemptsLast7Days })} · {t('parent.sessionsWeek', { n: data.sessionsThisWeek })}
          </p>

          {data.diagnostics.length > 0 && (
            <div style={{ margin: '0.8rem 0' }}>
              {data.diagnostics.map((d, i) => (
                <p key={i} style={{ color: 'var(--accent)' }}>
                  ⚠ {t(d.code === 'collapse' ? 'parent.diagCollapse' : 'parent.diagTrivial', { skill: d.skill })}
                </p>
              ))}
            </div>
          )}

          <div style={{ margin: '0.5rem 0' }}>
            <YearChange playerId={data.player.id} current={data.player.schoolYear} />
            {' · '}
            <SessionLen playerId={data.player.id} current={data.player.sessionTarget} />
            {' · '}
            <button className="idk" onClick={async () => { await postJSON('/api/parent/replay', { playerId: data.player.id }); getJSON<Overview>(`/api/parent/overview?playerId=${data.player.id}`).then(setData); }}>
              {t('parent.rebuild')}
            </button>
            {' · '}
            <a className="idk" href="/api/family/export" target="_blank" rel="noreferrer">{t('parent.export')}</a>
            {' · '}
            <button
              className="idk"
              style={{ color: 'var(--accent)' }}
              onClick={async () => {
                if (!confirm(t('parent.removeConfirm'))) return;
                await postJSON('/api/player/archive', { playerId: data.player.id });
                setSel(null);
                setData(null);
                loadAll();
              }}
            >
              {t('parent.removeChild')}
            </button>
          </div>

          {data.transfer.length > 0 && (
            <div style={{ margin: '0.8rem 0' }}>
              <p className="muted" style={{ fontSize: '0.85rem' }}>{t('parent.transfer')}</p>
              {data.transfer.map((tr) => {
                const drop = tr.beforeMedianMs - tr.afterMedianMs;
                return (
                  <p key={tr.component} style={{ margin: '0.15rem 0', color: drop > 0 ? 'var(--accent)' : undefined }}>
                    {tr.component.replace(/_/g, ' ')}: {(tr.beforeMedianMs / 1000).toFixed(1)}s → {(tr.afterMedianMs / 1000).toFixed(1)}s
                    {drop > 0 ? ` ↓${(drop / 1000).toFixed(1)}s` : ''} <span className="muted" style={{ fontSize: '0.75rem' }}>({tr.nBefore}/{tr.nAfter})</span>
                  </p>
                );
              })}
            </div>
          )}

          <UsagePanel usage={data.usage} />

          <ParentMapPanel key={data.player.id} playerId={data.player.id} />

          <div style={{ overflowX: 'auto' }}>
            <table className="plain-table">
              <thead>
                <tr>
                  <th>{t('parent.thSkill')}</th>
                  <th>{t('parent.thYear')}</th>
                  <th>θ</th>
                  <th>{t('parent.thFluency')}</th>
                </tr>
              </thead>
              <tbody>
                {data.skills.map((s) => (
                  <tr key={s.code}>
                    <td>{s.code.replace(/_/g, ' ')}</td>
                    <td>{s.year}</td>
                    <td>{s.theta.toFixed(2)}</td>
                    <td>{fluencyCell(s, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p style={{ marginTop: '2rem' }}>
        <a className="idk" href="/">{t('common.back')}</a>
      </p>
    </div>
  );
}

// The full skill graph, unfogged (the-map.md §6): the instrument where a fired
// diagnostic can be read in context — a collapsed node with its prerequisite
// edges right there. Loaded on demand; resets when another child is selected.
// The displacement safeguard (quasi-experimental §5). The inverse of an
// engagement dashboard: every number here is one you want low and flat. A quiet
// weekly line — if it climbs, that's a prompt for a human judgement at the table,
// never a target to grow. The one automated output is a calm ceiling alarm.
function UsagePanel({ usage }: { usage: Usage }) {
  const { t } = useI18n();
  const max = Math.max(1, ...usage.weekly.map((w) => w.sessions));
  return (
    <div style={{ margin: '0.8rem 0' }}>
      <p className="muted" style={{ fontSize: '0.85rem' }}>{t('parent.usage')}</p>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 34 }} aria-label={t('parent.usage')}>
        {usage.weekly.map((w) => (
          <span
            key={w.weekStart}
            title={`${w.sessions}`}
            style={{ width: 10, height: `${Math.round((w.sessions / max) * 100)}%`, minHeight: 2, background: w.sessions > 0 ? 'var(--ink-soft)' : 'var(--line)', display: 'inline-block', borderRadius: 2 }}
          />
        ))}
      </div>
      {usage.alarm && (
        <p style={{ color: 'var(--accent)', fontSize: '0.85rem', marginTop: '0.4rem' }}>
          ⚠ {t('parent.usageAlarm', { n: usage.sessionsLast7 })}
        </p>
      )}
    </div>
  );
}

function ParentMapPanel({ playerId }: { playerId: string }) {
  const { t } = useI18n();
  const [map, setMap] = useState<MapData | null>(null);
  const [open, setOpen] = useState(false);
  async function toggle() {
    if (open) return setOpen(false);
    if (!map) setMap(await getJSON<MapData>(`/api/parent/map?playerId=${playerId}`));
    setOpen(true);
  }
  return (
    <div style={{ margin: '0.5rem 0' }}>
      <button className="idk" onClick={toggle}>{open ? t('parent.mapHide') : t('parent.map')}</button>
      {open && map && <SkillMap data={map} variant="parent" />}
    </div>
  );
}

function FamilyGoal({ goal, onChange }: { goal: Goal | null; onChange: () => void }) {
  const { t } = useI18n();
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');
  if (!goal) return null;

  if (goal.goal) {
    return (
      <div className="namebtn" style={{ cursor: 'default' }}>
        {t('goal.progress', { label: goal.goal.label, done: goal.progress, target: goal.goal.target })}
        {goal.goal.reached ? ` · ${t('goal.reached')} 🎉` : ''}
        <button className="idk" onClick={async () => { await fetch('/api/parent/goal', { method: 'DELETE' }); onChange(); }}>
          {t('goal.remove')}
        </button>
        <p className="muted" style={{ fontSize: '0.8rem' }}>{t('goal.hint')}</p>
      </div>
    );
  }
  return (
    <div className="namebtn" style={{ cursor: 'default' }}>
      <input className="field" placeholder={t('goal.labelPlaceholder')} value={label} onChange={(e) => setLabel(e.target.value)} />
      <input className="field" placeholder={t('goal.targetPlaceholder')} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))} />
      <button className="primary" disabled={!label || !target} onClick={async () => { await postJSON('/api/parent/goal', { label, target: Number(target) }); setLabel(''); setTarget(''); onChange(); }}>
        {t('goal.set')}
      </button>
    </div>
  );
}

// Session length — shorter for a young child, so finishing (and the day's dot)
// is reachable. Ending early was never a failure; a smaller target just makes
// "done" honest for a six-year-old.
function SessionLen({ playerId, current }: { playerId: string; current: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!open)
    return <button className="idk" onClick={() => setOpen(true)}>{t('parent.changeLen')} · {t('parent.sessionLen', { n: current })}</button>;
  return (
    <span>
      {[6, 10, 15, 20].map((n) => (
        <button
          key={n}
          className="idk"
          style={{ color: current === n ? 'var(--accent)' : undefined }}
          onClick={async () => {
            await postJSON('/api/player/target', { playerId, target: n });
            location.reload();
          }}
        >
          {n}
        </button>
      ))}
    </span>
  );
}

function YearChange({ playerId, current }: { playerId: string; current: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!open) return <button className="idk" onClick={() => setOpen(true)}>{t('parent.changeYear')}</button>;
  return (
    <span>
      {['F', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((y, i) => (
        <button key={y} className="idk" style={{ color: current === i ? 'var(--accent)' : undefined }} onClick={async () => { await postJSON('/api/player/year', { playerId, schoolYear: i }); location.reload(); }}>
          {y}
        </button>
      ))}
    </span>
  );
}
