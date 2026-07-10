'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJSON, postJSON } from '@/lib/client';
import { BY_KEY } from '@/icons';
import { PinPad } from '../_components/PinPad';

type Player = { id: string; icon: string; schoolYear: number; archived: boolean };
type Overview = {
  player: { id: string; icon: string; schoolYear: number };
  attemptsLast7Days: number;
  diagnostics: string[];
  skills: { code: string; year: number; theta: number; mode: string; rate: number | null; rateState: string; aim: number | null }[];
};
type Goal = { goal: { label: string; target: number; reached: boolean } | null; progress: number };

function fluencyCell(s: Overview['skills'][number]): string {
  if (s.mode !== 'component') return '—';
  if (s.rate == null) return 'okänd';
  const tag = s.rateState === 'measured' ? 'mätt' : 'preliminärt';
  return `${s.rate.toFixed(0)}${s.aim ? `/${s.aim.toFixed(0)}` : ''} (${tag})`;
}

export default function Parent() {
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
    else setErr('Fel PIN.');
  }

  if (gate === 'checking') return <div className="plain muted">…</div>;
  if (gate === 'pin')
    return (
      <div className="plain" style={{ textAlign: 'center' }}>
        <h1>Förälder</h1>
        <PinPad label="Förälderns PIN" onComplete={unlock} />
        {err && <p className="muted">{err}</p>}
        <a className="idk" href="/">tillbaka</a>
      </div>
    );

  return (
    <div className="plain">
      <h1>Översikt</h1>
      <p className="muted">
        Inget att kolla dagligen. En tom sida är en frisk sida — meddelanden dyker upp bara om något i grafen ser fel ut.
      </p>

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
            Årskurs {data.player.schoolYear === 0 ? 'F' : data.player.schoolYear} · Svar senaste 7 dagarna: {data.attemptsLast7Days}
          </p>

          {data.diagnostics.length > 0 && (
            <div style={{ margin: '0.8rem 0' }}>
              {data.diagnostics.map((d, i) => (
                <p key={i} style={{ color: 'var(--accent)' }}>⚠ {d}</p>
              ))}
            </div>
          )}

          <div style={{ margin: '0.5rem 0' }}>
            <YearChange playerId={data.player.id} current={data.player.schoolYear} />
            {' · '}
            <button className="idk" onClick={async () => { await postJSON('/api/parent/replay', { playerId: data.player.id }); getJSON<Overview>(`/api/parent/overview?playerId=${data.player.id}`).then(setData); }}>
              bygg om cache
            </button>
            {' · '}
            <a className="idk" href="/api/family/export" target="_blank" rel="noreferrer">exportera</a>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="plain-table">
              <thead>
                <tr>
                  <th>färdighet</th>
                  <th>åk</th>
                  <th>θ</th>
                  <th>flyt</th>
                </tr>
              </thead>
              <tbody>
                {data.skills.map((s) => (
                  <tr key={s.code}>
                    <td>{s.code.replace(/_/g, ' ')}</td>
                    <td>{s.year}</td>
                    <td>{s.theta.toFixed(2)}</td>
                    <td>{fluencyCell(s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p style={{ marginTop: '2rem' }}>
        <a className="idk" href="/">tillbaka</a>
      </p>
    </div>
  );
}

function FamilyGoal({ goal, onChange }: { goal: Goal | null; onChange: () => void }) {
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');
  if (!goal) return null;

  if (goal.goal) {
    return (
      <div className="namebtn" style={{ cursor: 'default' }}>
        Mål: <strong>{goal.goal.label}</strong> — {goal.progress}/{goal.goal.target} pass
        {goal.goal.reached ? ' · nått! 🎉' : ''}
        <button className="idk" onClick={async () => { await fetch('/api/parent/goal', { method: 'DELETE' }); onChange(); }}>
          ta bort
        </button>
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          Räknas i pass, för hela familjen. Vem som gjort vad visas aldrig — alla åker till simhallen, eller ingen.
        </p>
      </div>
    );
  }
  return (
    <div className="namebtn" style={{ cursor: 'default' }}>
      <input className="field" placeholder="mål, t.ex. simhallen" value={label} onChange={(e) => setLabel(e.target.value)} />
      <input className="field" placeholder="antal pass" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))} />
      <button className="primary" disabled={!label || !target} onClick={async () => { await postJSON('/api/parent/goal', { label, target: Number(target) }); setLabel(''); setTarget(''); onChange(); }}>
        Sätt familjemål
      </button>
    </div>
  );
}

function YearChange({ playerId, current }: { playerId: string; current: number }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="idk" onClick={() => setOpen(true)}>ändra årskurs</button>;
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
