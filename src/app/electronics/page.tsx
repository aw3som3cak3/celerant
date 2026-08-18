'use client';

import { useEffect, useState, useCallback } from 'react';
import { getJSON, postJSON } from '@/lib/client';
import { TestFamilyGate } from '../_components/TestFamilyGate';
import { PinPad } from '../_components/PinPad';
import { EmojiIcon } from '../_components/Icon';

// The BUILD-LADDER surface (docs/electronics-subject-plan.md §2b) — grownup + kid facing. Shows a
// child's ready / locked / done builds, the kit + kid-with-adult instructions when a build is ready,
// and an ADULT-confirm "Klart" control that writes the completion + durable capability facts. It is
// a CONSUMER of the fluency signal beside the engine: it never touches the selector/θ/gate/ledger.
//
// GUARDRAILS: witness, don't reward — no points, streaks, badges or leaderboards; private, not
// comparative — one child at a time (never siblings side by side); non-punitive — a locked build
// just lists what is still needed. Test-family gated (fox+hotdog), like the other demo surfaces.

type Skill = { code: string; met: boolean };
type LadderRow = {
  buildId: string;
  name: string;
  tier: string;
  status: 'ready' | 'locked' | 'done';
  skills: Skill[];
  skillsMet: boolean;
  equipment: { code: string; owned: boolean }[];
  equipmentOwned: boolean;
  tierUnlocked: boolean;
  kitBom: { qty: number; part: string }[];
  instructions: string[];
};
type Korkort = {
  id: string;
  namn: string;
  tier: string;
  state: 'locked' | 'todo' | 'earned';
  prov: string;
  grants: string;
  kitBom: { qty: number; part: string }[];
  instructions: { kid: string[]; adult: string[] };
};
type Player = {
  id: string;
  icon: string;
  schoolYear: number;
  ladder: LadderRow[];
  capabilities: { capability: string; granted_at: number; source: string }[];
  alerts: unknown[];
  korkort: Korkort[];
};
type Data = { authorized: boolean; adult: boolean; players: Player[] };

const CAP_LABEL: Record<string, string> = {
  elec_cap_owns_breadboard: 'har en kopplingsplatta',
  elec_cap_tier_3v: '3 V upplåst',
  elec_cap_tier_5v: '5 V upplåst',
  elec_cap_soldering: 'lödning upplåst',
};
const TIER_LABEL: Record<string, string> = { coin: 'knappcell', '3v': '3 V', '5v': '5 V', soldering: 'lödning' };

export default function Page() {
  return (
    <TestFamilyGate>
      <BuildLadder />
    </TestFamilyGate>
  );
}

function BuildLadder() {
  const [data, setData] = useState<Data | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const d = await getJSON<Data>('/api/electronics');
    setData(d);
    setSel((cur) => cur ?? d.players[0]?.id ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function unlock(pin: string) {
    setErr('');
    const r = await postJSON<{ ok?: boolean }>('/api/parent/login', { parentPin: pin });
    if (r.ok) load();
    else setErr('Fel PIN.');
  }

  async function confirmBuild(playerId: string, buildId: string) {
    await postJSON('/api/electronics', { playerId, action: 'complete_build', buildId });
    load();
  }
  async function confirmEquipment(playerId: string, capability: string) {
    await postJSON('/api/electronics', { playerId, action: 'confirm_equipment', capability });
    load();
  }

  if (!data) return <div className="stage"><p className="muted">…</p></div>;

  const player = data.players.find((p) => p.id === sel) ?? data.players[0];

  return (
    <div className="stage" style={{ justifyContent: 'flex-start', paddingTop: '1.5rem', gap: '1rem', maxWidth: 560, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Bygg-stege</h1>
      <p className="muted" style={{ textAlign: 'center', maxWidth: 460 }}>
        Riktiga byggen som låses upp när ett barn kan det som behövs. En vuxen bygger bredvid och bekräftar
        när det är klart.
      </p>

      {/* One child at a time — private, never a comparison of siblings. */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        {data.players.map((p) => (
          <button
            key={p.id}
            className={`pill-btn ${p.id === player?.id ? 'accent' : ''}`}
            onClick={() => setSel(p.id)}
          >
            <EmojiIcon iconKey={p.icon} /> åk {p.schoolYear}
          </button>
        ))}
      </div>

      {!data.adult && (
        <div style={{ textAlign: 'center' }}>
          <p className="muted">Vuxen: lås upp för att bekräfta ett bygge.</p>
          <PinPad label="Förälder-PIN" onComplete={unlock} />
          {err && <p className="muted">{err}</p>}
        </div>
      )}

      {/* Show only what a grownup can ACT on: körkort the child is ready to earn (todo/earned), and
          builds where the SKILLS are done (ready to test, or just needing gear/tier confirmed). A
          skills-locked card only listed raw codes and told the adult nothing, so it's hidden — the
          child is simply still practising. */}
      {(() => {
        const visKorkort = player?.korkort.filter((k) => k.state !== 'locked') ?? [];
        const visBuilds = player?.ladder.filter((row) => row.status !== 'locked' || row.skillsMet) ?? [];
        if (visKorkort.length === 0 && visBuilds.length === 0) {
          return (
            <p className="muted" style={{ textAlign: 'center', maxWidth: 420, marginTop: '0.5rem' }}>
              Inga körkort eller byggen redo än — barnet övar färdigheterna först. De dyker upp här när
              barnet är redo att testas vid bänken.
            </p>
          );
        }
        return (
          <>
            {visKorkort.length > 0 && <KorkortStrip korkort={visKorkort} />}
            {player &&
              visBuilds.map((row) => (
                <BuildCard
                  key={row.buildId}
                  row={row}
                  adult={data.adult}
                  onComplete={() => confirmBuild(player.id, row.buildId)}
                  onConfirmEquipment={(cap) => confirmEquipment(player.id, cap)}
                />
              ))}
          </>
        );
      })()}
    </div>
  );
}

// The KÖRKORT strip (docs/electronics-korkort-flow.md): the three-state körkort a master approves at
// the bench. EARNED derives from the capability the build approval below already grants — this strip
// just witnesses it. Approval carries NO score; a körkort is private and never a comparison.
function KorkortStrip({ korkort }: { korkort: Korkort[] }) {
  const KSTATE: Record<Korkort['state'], string> = {
    locked: 'låst',
    todo: 'redo för prov',
    earned: '🪪 godkänt körkort',
  };
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <h2 style={{ fontSize: '1.1rem', margin: '0.5rem 0 0' }}>Körkort</h2>
      {korkort.map((k) => (
        <div
          key={k.id}
          style={{
            border: '1px solid var(--line, #ddd)',
            borderRadius: 12,
            padding: '0.8rem',
            opacity: k.state === 'locked' ? 0.7 : 1,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
            <strong>Körkort: {k.namn}</strong>
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>{KSTATE[k.state]}</span>
          </div>
          {k.state === 'todo' && (
            <div className="muted" style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              <p style={{ margin: '0 0 0.4rem' }}><strong>Prov:</strong> {k.prov}</p>
              <details>
                <summary>Byggsats + vad du godkänner</summary>
                <ul style={{ margin: '0.4rem 0' }}>
                  {k.kitBom.map((l, i) => (
                    <li key={i}>{l.qty}× {l.part}</li>
                  ))}
                </ul>
                <ol style={{ margin: '0.4rem 0' }}>
                  {k.instructions.adult.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </details>
              <p style={{ marginTop: '0.4rem', fontSize: '0.82rem' }}>
                Godkänn körkortet genom att bekräfta rätt bygge nedan.
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BuildCard({
  row,
  adult,
  onComplete,
  onConfirmEquipment,
}: {
  row: LadderRow;
  adult: boolean;
  onComplete: () => void;
  onConfirmEquipment: (cap: string) => void;
}) {
  const badge =
    row.status === 'done' ? '✓ klart' : row.status === 'ready' ? 'redo att bygga' : 'låst';
  return (
    <div
      style={{
        border: '1px solid var(--line, #ddd)',
        borderRadius: 12,
        padding: '1rem',
        width: '100%',
        opacity: row.status === 'locked' ? 0.85 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <strong>{row.name}</strong>
        <span className="muted" style={{ whiteSpace: 'nowrap' }}>{badge} · {TIER_LABEL[row.tier] ?? row.tier}</span>
      </div>

      {row.status === 'locked' && (
        <div className="muted" style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
          {!row.skillsMet && (
            <div>Färdigheter kvar: {row.skills.filter((s) => !s.met).map((s) => s.code).join(', ')}</div>
          )}
          {!row.equipmentOwned &&
            row.equipment
              .filter((e) => !e.owned)
              .map((e) => (
                <div key={e.code} style={{ marginTop: '0.3rem' }}>
                  Utrustning kvar: {CAP_LABEL[e.code] ?? e.code}
                  {adult && e.code === 'elec_cap_owns_breadboard' && (
                    <button className="softbtn" style={{ marginLeft: '0.5rem' }} onClick={() => onConfirmEquipment(e.code)}>
                      Bekräfta att barnet har den
                    </button>
                  )}
                </div>
              ))}
          {!row.tierUnlocked && <div style={{ marginTop: '0.3rem' }}>Spänningssteg ännu ej upplåst.</div>}
        </div>
      )}

      {(row.status === 'ready' || row.status === 'done') && (
        <div style={{ marginTop: '0.6rem' }}>
          <details open={row.status === 'ready'}>
            <summary className="muted">Byggsats (att packa) + instruktioner</summary>
            <ul style={{ margin: '0.5rem 0' }}>
              {row.kitBom.map((l, i) => (
                <li key={i}>{l.qty}× {l.part}</li>
              ))}
            </ul>
            <ol style={{ margin: '0.5rem 0' }}>
              {row.instructions.map((step, i) => (
                <li key={i} style={{ marginBottom: '0.25rem' }}>{step}</li>
              ))}
            </ol>
          </details>
          {row.status === 'ready' && adult && (
            <button className="softbtn" onClick={onComplete}>Godkänn körkort: klart ✓</button>
          )}
          {row.status === 'ready' && !adult && (
            <p className="muted" style={{ fontSize: '0.85rem' }}>En vuxen bekräftar när bygget är klart.</p>
          )}
        </div>
      )}
    </div>
  );
}
