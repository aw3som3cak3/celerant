'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJSON, postJSON } from '@/lib/client';
import { BY_KEY } from '@/icons';
import { EmojiIcon } from '../_components/Icon';
import { PinPad } from '../_components/PinPad';
import { SkillMap, type MapData } from '../_components/SkillMap';
import { IconGrid } from '../_components/IconGrid';
import { useI18n } from '../_components/LocaleProvider';
import { Emoji } from '../_components/Emoji';
import { fluencyDisplay } from '@/lib/parent-fluency';

type Player = { id: string; icon: string; schoolYear: number; archived: boolean };
type Diagnostic = { code: 'collapse' | 'trivial' | 'underplaced'; skill: string };
const DIAG_KEY = {
  collapse: 'parent.diagCollapse',
  trivial: 'parent.diagTrivial',
  underplaced: 'parent.diagUnderplaced',
} as const;
type Transfer = { component: string; beforeMedianMs: number; afterMedianMs: number; nBefore: number; nAfter: number };
type Usage = { weekly: { weekStart: number; sessions: number }[]; lateEveningSessions: number; enTillRate: number; sessionsLast7: number; alarm: boolean };
type SkillCalibration = { code: string; n: number; observed: number; verdict: 'ok' | 'too_hard' | 'too_easy' };
type Fatigue = { curve: { pos: number; n: number; firstTry: number }[]; breakPos: number | null; currentTarget: number; enoughData: boolean };
type SkillRow = { code: string; year: number; depth: number; theta: number; mode: 'component' | 'compound'; rate: number | null; rateState: 'unknown' | 'provisional' | 'measured'; aim: number | null; touched: boolean; unlocked: boolean };
type Overview = {
  player: { id: string; icon: string; schoolYear: number; sessionTarget: number; seedGrade: number };
  attemptsLast7Days: number;
  sessionsThisWeek: number;
  diagnostics: Diagnostic[];
  transfer: Transfer[];
  usage: Usage;
  calibration: SkillCalibration[];
  fatigue: Fatigue;
  skills: SkillRow[];
};
type Goal = { goal: { label: string; target: number; reached: boolean } | null; progress: number };
type T = (key: string, params?: Record<string, string | number>) => string;

// Only a MEASURED sprint rate shows a fraction; a seeded/provisional rate reads
// "ej övad" — never as completed sprints the child never did (bug-hunt-fluency.md).
function fluencyCell(s: Overview['skills'][number], t: T): string {
  const d = fluencyDisplay(s);
  if (d.kind === 'na') return '—';
  if (d.kind === 'notPractised') return t('parent.fluNotPractised');
  return `${d.rate.toFixed(0)}${d.aim ? `/${d.aim.toFixed(0)}` : ''} (${t('parent.fluMeasured')})`;
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
            <EmojiIcon iconKey={p.icon} />
          </button>
        ))}
      </div>

      {/* Adding a child is a parent action — it lives here, behind the PIN, not on
          the shared family screen the kids see. */}
      {players && <AddChild used={players.map((p) => p.icon)} onDone={loadAll} />}

      {data && (
        <>
          <p className="muted">
            {t('parent.year')} {data.player.schoolYear === 0 ? 'F' : data.player.schoolYear} · {t('parent.attempts7', { n: data.attemptsLast7Days })} · {t('parent.sessionsWeek', { n: data.sessionsThisWeek })}
          </p>

          {data.diagnostics.length > 0 && (
            <div style={{ margin: '0.8rem 0' }}>
              {data.diagnostics.map((d, i) => (
                <p key={i} style={{ color: 'var(--accent)' }}>
                  <Emoji e="⚠" /> {t(DIAG_KEY[d.code], { skill: d.skill })}
                </p>
              ))}
            </div>
          )}

          <CalibrationPanel data={data} />

          <CurriculumProfile data={data} />


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
                  // Untouched skills (seed only, never served) are greyed so a
                  // parent can tell assumed from demonstrated at a glance.
                  <tr key={s.code} style={s.touched ? undefined : { color: 'var(--muted, #999)', opacity: 0.6 }} title={s.touched ? undefined : t('parent.notPractisedRow')}>
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
          <Emoji e="⚠" /> {t('parent.usageAlarm', { n: usage.sessionsLast7 })}
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
  const [addingNew, setAddingNew] = useState(false);
  if (!goal) return null;

  // Setting a goal replaces any current one and restarts its count at 0.
  const setForm = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
      <input className="field" placeholder={t('goal.labelPlaceholder')} value={label} onChange={(e) => setLabel(e.target.value)} />
      <input className="field" placeholder={t('goal.targetPlaceholder')} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))} />
      <button
        className="primary"
        disabled={!label || !target}
        onClick={async () => { await postJSON('/api/parent/goal', { label, target: Number(target) }); setLabel(''); setTarget(''); setAddingNew(false); onChange(); }}
      >
        {t('goal.set')}
      </button>
    </div>
  );

  // A goal is set: show its progress, a clear CLOSE button (the parent decides
  // when it's fulfilled), and a clear way to set a NEW one.
  if (goal.goal) {
    return (
      <div className="namebtn" style={{ cursor: 'default' }}>
        <div>
          {t('goal.progress', { label: goal.goal.label, done: goal.progress, target: goal.goal.target })}
          {goal.goal.reached ? <> · {t('goal.reached')} <Emoji e="🎉" /></> : ''}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <button
            className={`pill-btn ${goal.goal.reached ? 'accent' : ''}`}
            onClick={async () => { await fetch('/api/parent/goal', { method: 'DELETE' }); onChange(); }}
          >
            {t('goal.done')}
          </button>
          {!addingNew && <button className="pill-btn" onClick={() => setAddingNew(true)}>{t('goal.new')}</button>}
        </div>
        {addingNew && setForm}
        <p className="muted" style={{ fontSize: '0.8rem' }}>{t('goal.hint')}</p>
      </div>
    );
  }
  // No goal yet: the set-goal form, always available.
  return <div className="namebtn" style={{ cursor: 'default' }}>{setForm}</div>;
}

// Add a child — a parent action (behind the PIN). Pick an icon, then set the child's
// årskurs: the parent knows it, and it seeds where the child starts (start-from-below
// still applies from there). Can be changed later on the child (YearChange).
function AddChild({ used, onDone }: { used: string[]; onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [icon, setIcon] = useState<string | null>(null);
  const [err, setErr] = useState('');
  function close() { setOpen(false); setIcon(null); setErr(''); }
  async function create(schoolYear: number) {
    if (!icon) return;
    const r = await postJSON<{ ok?: boolean; error?: string }>('/api/player', { icon, schoolYear });
    if (r.ok) { close(); onDone(); } else setErr(t('player.iconTaken'));
  }
  return (
    <div style={{ margin: '0.5rem 0' }}>
      <button className="pill-btn" onClick={() => setOpen(true)}>+ {t('players.addChild')}</button>
      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>{t('players.addChild')}</strong>
              <button className="idk" onClick={close}>{t('common.close')}</button>
            </div>
            {!icon ? (
              <IconGrid allowSearch exclude={new Set(used)} onPick={setIcon} />
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div className="bigpair" style={{ margin: '0.4rem 0' }}><EmojiIcon iconKey={icon} /></div>
                <p className="muted">{t('parent.pickYear')}</p>
                <div className="yearpick">
                  {['F', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((y, i) => (
                    <button key={y} className="pill-btn" onClick={() => create(i)}>{y}</button>
                  ))}
                </div>
                <button className="idk" style={{ marginTop: '0.8rem' }} onClick={() => setIcon(null)}>{t('common.back')}</button>
              </div>
            )}
            {err && <p className="muted">{err}</p>}
          </div>
        </div>
      )}
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

// The calibration monitor, parent-facing. Two watchdogs on how the model is placing
// THIS child: (1) skills where predicted (~80% aim) and observed first-try diverge —
// too-hard means the estimate is serving her problems she can't do; (2) the fatigue
// curve — if her first-try craters after position N, the session is too long and its
// tail is poisoning the numbers. Silent when all is well (an empty panel is normal).
function CalibrationPanel({ data }: { data: Overview }) {
  const { t } = useI18n();
  const label = (code: string) => code.replace(/_/g, ' ');
  const flagged = data.calibration.filter((c) => c.verdict !== 'ok');
  const fat = data.fatigue;
  const suggestShorter = fat.enoughData && fat.breakPos != null && fat.breakPos < fat.currentTarget;
  if (flagged.length === 0 && !suggestShorter) return null; // nothing to say → say nothing

  return (
    <div className="calib-panel">
      {flagged.map((c) => (
        <p key={c.code} className="calib-row">
          <Emoji e="🎯" /> <strong>{label(c.code)}</strong>: {t('parent.calibServed')} {Math.round(c.observed * 100)}%{' '}
          <span className={c.verdict === 'too_hard' ? 'calib-hard' : 'calib-easy'}>
            {t(c.verdict === 'too_hard' ? 'parent.calibTooHard' : 'parent.calibTooEasy')}
          </span>{' '}
          <span className="muted">(n={c.n})</span>
        </p>
      ))}
      {suggestShorter && (
        <p className="calib-row">
          <Emoji e="⚠" /> {t('parent.calibFatigue', { n: fat.breakPos!, target: fat.currentTarget })}{' '}
          <button className="idk" style={{ color: 'var(--accent)' }} onClick={async () => { await postJSON('/api/player/target', { playerId: data.player.id, target: fat.breakPos! }); location.reload(); }}>
            {t('parent.calibSetTo', { n: fat.breakPos! })}
          </button>
        </p>
      )}
    </div>
  );
}

// The curriculum profile — one chart, two questions in a single vertical read: how far
// along the curriculum a child is (θ per skill), and how solid it is underneath (the
// fluency band). PARENT-ONLY: it aggregates into something a child could optimise
// ("fill the band"), so it never appears on a child surface. Honest by construction —
// dots only for TOUCHED skills, no trend line across gaps we have no evidence for.
const CP = { col: 15, padL: 10, padR: 10, abilityH: 96, gap: 8, bandH: 16, yearH: 18 };
const THETA_CLAMP = 3;
const MIN_FRONTIER = 5; // don't draw a "frontier" through fewer touched points than this

function CurriculumProfile({ data }: { data: Overview }) {
  const { t } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const skills = data.skills; // already in curriculum order (year, depth, code)
  const n = skills.length;
  const label = (code: string) => code.replace(/_/g, ' ');

  const W = CP.padL + n * CP.col + CP.padR;
  const bandY = CP.yearH + CP.abilityH + CP.gap;
  const H = bandY + CP.bandH + 6;
  const xMid = (i: number) => CP.padL + i * CP.col + CP.col / 2;
  const yFor = (theta: number) => CP.yearH + (1 - (Math.max(-THETA_CLAMP, Math.min(THETA_CLAMP, theta)) + THETA_CLAMP) / (2 * THETA_CLAMP)) * CP.abilityH;
  const y0 = yFor(0);

  // Year bands for the X axis (F, 1…9), each spanning its run of columns.
  const bands: { year: number; from: number; to: number }[] = [];
  skills.forEach((s, i) => {
    const last = bands[bands.length - 1];
    if (last && last.year === s.year) last.to = i;
    else bands.push({ year: s.year, from: i, to: i });
  });

  // Frontier: first TOUCHED skill whose θ has dipped below 0 — suppressed if the child
  // has too few touched skills for a line to mean anything.
  const touchedCount = skills.filter((s) => s.touched).length;
  const frontierI = touchedCount >= MIN_FRONTIER ? skills.findIndex((s) => s.touched && s.theta < 0) : -1;
  // Placement: where the grade prior stops assuming mastery (first skill above the seed
  // grade). A muted second marker — the gap to the frontier is assumed-vs-demonstrated.
  const placementI = skills.findIndex((s) => s.year > data.player.seedGrade);
  const measuredCount = skills.filter((s) => s.rateState === 'measured').length;

  const yr = (y: number) => (y === 0 ? 'F' : String(y));
  const summary = t('parent.cpAria', { measured: measuredCount, total: n, frontier: frontierI >= 0 ? label(skills[frontierI].code) : '—' });

  return (
    <div className="cp-wrap">
      <div className="cp-head">{t('parent.cpTitle')}</div>
      <div className="cp-scroll">
        <svg width={W} height={H} role="img" aria-label={summary} className="cp-svg">
          {/* year bands + labels */}
          {bands.map((b, k) => {
            const x = CP.padL + b.from * CP.col;
            const w = (b.to - b.from + 1) * CP.col;
            return (
              <g key={k}>
                {k % 2 === 1 && <rect x={x} y={CP.yearH} width={w} height={bandY + CP.bandH - CP.yearH} className="cp-band-bg" />}
                <text x={x + w / 2} y={12} className="cp-year">{yr(b.year)}</text>
              </g>
            );
          })}
          {/* θ = 0 reference */}
          <line x1={CP.padL} y1={y0} x2={W - CP.padR} y2={y0} className="cp-zero" />
          {/* placement + frontier markers */}
          {placementI >= 0 && <line x1={xMid(placementI)} y1={CP.yearH} x2={xMid(placementI)} y2={bandY + CP.bandH} className="cp-placement" />}
          {frontierI >= 0 && <line x1={xMid(frontierI)} y1={CP.yearH} x2={xMid(frontierI)} y2={bandY + CP.bandH} className="cp-frontier" />}
          {/* fluency band — one cell per skill, aligned to the same X */}
          {skills.map((s, i) => {
            const x = CP.padL + i * CP.col;
            const measured = s.rateState === 'measured';
            const fill = measured && s.aim ? Math.max(0, Math.min(1, (s.rate ?? 0) / s.aim)) : 0;
            const cls = measured ? 'cp-cell-measured' : s.unlocked ? 'cp-cell-reachable' : 'cp-cell-locked';
            return (
              <g key={`b${i}`}>
                <rect x={x + 0.5} y={bandY} width={CP.col - 1} height={CP.bandH} className={cls} />
                {measured && <rect x={x + 0.5} y={bandY + CP.bandH * (1 - fill)} width={CP.col - 1} height={CP.bandH * fill} className="cp-cell-fill" />}
              </g>
            );
          })}
          {/* ability dots — TOUCHED skills only, no connecting line across gaps */}
          {skills.map((s, i) => (s.touched ? <circle key={`d${i}`} cx={xMid(i)} cy={yFor(s.theta)} r={3} className="cp-dot" /> : null))}
          {/* hover/focus hit targets — one focusable column each */}
          {skills.map((s, i) => (
            <rect
              key={`h${i}`}
              x={CP.padL + i * CP.col}
              y={CP.yearH}
              width={CP.col}
              height={bandY + CP.bandH - CP.yearH}
              className={`cp-hit ${hover === i ? 'on' : ''}`}
              tabIndex={0}
              role="button"
              aria-label={`${label(s.code)}, θ ${s.theta.toFixed(2)}${s.touched ? '' : ' (ej övad)'}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onFocus={() => setHover(i)}
            />
          ))}
        </svg>
      </div>
      <div className="cp-detail muted">
        {hover != null ? (
          <span>
            <strong>{label(skills[hover].code)}</strong> · θ {skills[hover].theta.toFixed(2)}
            {skills[hover].touched ? '' : ` · ${t('parent.cpUntouched')}`}
            {skills[hover].aim != null && ` · ${t('parent.cpRate')} ${skills[hover].rate != null && skills[hover].rateState === 'measured' ? Math.round(skills[hover].rate!) : '—'}/${Math.round(skills[hover].aim!)}`}
          </span>
        ) : (
          <span>{t('parent.cpMeasured', { measured: measuredCount, total: n })}</span>
        )}
      </div>
      <div className="cp-legend muted">
        <span><i className="cp-lg cp-cell-measured" /> {t('parent.cpLegMeasured')}</span>
        <span><i className="cp-lg cp-cell-reachable" /> {t('parent.cpLegReachable')}</span>
        <span><i className="cp-lg cp-cell-locked" /> {t('parent.cpLegLocked')}</span>
        {placementI >= 0 && <span><i className="cp-lg-line cp-placement" /> {t('parent.cpLegPlacement')}</span>}
        {frontierI >= 0 && <span><i className="cp-lg-line cp-frontier" /> {t('parent.cpLegFrontier')}</span>}
      </div>
    </div>
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
