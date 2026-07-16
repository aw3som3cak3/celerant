'use client';

import { useI18n } from './LocaleProvider';

// The Standard Celeration Chart (addendum §5): correct-per-minute on a
// semi-logarithmic vertical axis against calendar days. On the log scale a
// constant multiplicative growth rate is a straight line. Corrects are dots
// climbing; errors are crosses descending; the aim line is drawn faintly.

export type ChartData = {
  code: string;
  points: { day: number; correctPerMin: number; errorsPerMin: number }[];
  aim: number | null;
  celeration: number | null;
};

const W = 520;
const H = 300;
const PAD = 40;

// showAim draws the faint aim line. It defaults OFF: the child's victory-lap chart
// compares their rising line against nothing but their own past — no aim-as-verdict,
// no "you must reach here" bar (fluency-sprint-wiring §4). A future parent view can
// opt in with showAim.
export function CelerationChart({ data, showAim = false }: { data: ChartData; showAim?: boolean }) {
  const { t } = useI18n();
  if (data.points.length === 0) {
    return <p className="muted">{t('chart.noSprints')}</p>;
  }

  // Log vertical scale. Clamp the visible band to [1, top].
  const values = data.points.flatMap((p) => [p.correctPerMin, p.errorsPerMin]).filter((v) => v > 0);
  const top = Math.max(data.aim ?? 0, ...values, 10) * 1.3;
  const lo = 1;
  const logLo = Math.log10(lo);
  const logHi = Math.log10(top);

  const maxDay = Math.max(1, ...data.points.map((p) => p.day));

  const x = (day: number) => PAD + (day / maxDay) * (W - 2 * PAD);
  const y = (v: number) => {
    const clamped = Math.max(lo, v);
    return H - PAD - ((Math.log10(clamped) - logLo) / (logHi - logLo)) * (H - 2 * PAD);
  };

  // Horizontal gridlines at each power-of-ten-ish tick.
  const ticks: number[] = [];
  for (let t = 1; t <= top; t *= 2) ticks.push(t);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} role="img" aria-label="celeration chart">
        {/* gridlines */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD} x2={W - PAD} y1={y(t)} y2={y(t)} stroke="#eee" />
            <text x={4} y={y(t) + 4} fontSize={10} fill="#9aa">
              {t}
            </text>
          </g>
        ))}
        {/* aim line, faint — opt-in only (never in the child's victory-lap view) */}
        {showAim && data.aim != null && data.aim >= lo && (
          <line x1={PAD} x2={W - PAD} y1={y(data.aim)} y2={y(data.aim)} stroke="#c8a24a" strokeDasharray="4 4" />
        )}
        {/* corrects: dots + connecting line */}
        <polyline
          fill="none"
          stroke="#3a5a78"
          strokeWidth={1.5}
          points={data.points.map((p) => `${x(p.day)},${y(p.correctPerMin)}`).join(' ')}
        />
        {data.points.map((p, i) => (
          <circle key={`c${i}`} cx={x(p.day)} cy={y(p.correctPerMin)} r={4} fill="#3a5a78" />
        ))}
        {/* errors: crosses */}
        {data.points.map((p, i) =>
          p.errorsPerMin > 0 ? (
            <g key={`e${i}`} stroke="#a5493f" strokeWidth={1.5}>
              <line x1={x(p.day) - 4} y1={y(p.errorsPerMin) - 4} x2={x(p.day) + 4} y2={y(p.errorsPerMin) + 4} />
              <line x1={x(p.day) - 4} y1={y(p.errorsPerMin) + 4} x2={x(p.day) + 4} y2={y(p.errorsPerMin) - 4} />
            </g>
          ) : null,
        )}
        {/* axes */}
        <line x1={PAD} x2={PAD} y1={PAD} y2={H - PAD} stroke="#ccc" />
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="#ccc" />
        <text x={W / 2} y={H - 6} fontSize={11} fill="#9aa" textAnchor="middle">
          {t('chart.days')}
        </text>
      </svg>
      <p className="muted">
        {data.celeration != null ? (
          <>{t('chart.celeration', { x: data.celeration.toFixed(2) })}</>
        ) : (
          <>{t('chart.keepGoing')}</>
        )}
      </p>
    </div>
  );
}
