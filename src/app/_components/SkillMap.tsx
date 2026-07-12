'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Renders the skill DAG (the-map.md). The child variant shows reached cards, a
// glowing frontier and one ring of silhouettes; the parent variant shows the
// whole graph. Positions come from the server (graph-only, stable); this file
// only turns grid coordinates into pixels and draws the edges behind the nodes.

export type MapNode = {
  id: string;
  x: number;
  y: number;
  state: 'reached' | 'frontier' | 'near' | 'locked';
  family?: string;
  label?: string;
  prompt?: string;
  given?: string | null;
  earnedAt?: number;
  theta?: number;
  year?: number;
};
export type MapEdge = { from: string; to: string };
export type MapData = { nodes: MapNode[]; edges: MapEdge[]; cols: number; rows: number };

const COL = 172; // spacing along the tier axis
const ROW = 104; // spacing across the tier
const NODE_W = 150;
const NODE_H = 84;

export function SkillMap({
  data,
  variant,
  playerId,
}: {
  data: MapData;
  variant: 'child' | 'parent';
  playerId?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Phone: lay the tiers top-to-bottom instead of left-to-right (the-map §7).
  const [vertical, setVertical] = useState(false);
  useEffect(() => {
    const check = () => setVertical(window.innerWidth < 720);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // grid (x = tier, y = within-tier) -> pixels, transposed on a phone.
  const left = (n: { x: number; y: number }) => (vertical ? n.y * ROW : n.x * COL);
  const top = (n: { x: number; y: number }) => (vertical ? n.x * COL : n.y * ROW);
  const canvasW = (vertical ? data.rows * ROW : data.cols * COL) + 24;
  const canvasH = (vertical ? data.cols * COL : data.rows * ROW) + 24;

  const byId = new Map(data.nodes.map((n) => [n.id, n]));

  // Keep the frontier in view without scrolling: start scrolled to the leading
  // edge (the-map §7). Reached territory extends off-screen behind it.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const lead = data.nodes.filter((n) => n.state === 'frontier' || n.state === 'reached');
    if (!lead.length) return;
    const maxX = Math.max(...lead.map((n) => n.x));
    if (vertical) el.scrollTop = Math.max(0, maxX * COL - el.clientHeight * 0.5);
    else el.scrollLeft = Math.max(0, maxX * COL - el.clientWidth * 0.6);
  }, [data, vertical]);

  return (
    <div className="map-scroll" ref={scrollRef}>
      <div className="map-canvas" style={{ width: canvasW, height: canvasH }}>
        <svg className="map-edges" width={canvasW} height={canvasH}>
          {data.edges.map((e, i) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            return (
              <line
                key={i}
                x1={left(a) + NODE_W / 2}
                y1={top(a) + NODE_H / 2}
                x2={left(b) + NODE_W / 2}
                y2={top(b) + NODE_H / 2}
              />
            );
          })}
        </svg>
        {data.nodes.map((n) => (
          <NodeView key={n.id} n={n} left={left(n)} top={top(n)} variant={variant} playerId={playerId} />
        ))}
      </div>
    </div>
  );
}

function NodeView({
  n,
  left,
  top,
  variant,
  playerId,
}: {
  n: MapNode;
  left: number;
  top: number;
  variant: 'child' | 'parent';
  playerId?: string;
}) {
  const style = { left, top, width: NODE_W, height: NODE_H } as const;

  // A silhouette: something is there, you cannot see what (the-map §2).
  if (n.state === 'near') return <div className="mapnode near" style={style} aria-hidden />;

  // The child's frontier is also the chooser: tapping a glowing node starts a
  // session there (the-map §2 — the map and the chooser are the same object).
  if (variant === 'child' && n.state === 'frontier') {
    return (
      <button
        className="mapnode frontier"
        style={style}
        onClick={() => playerId && (location.href = `/practice?p=${playerId}&start=${n.id}`)}
      >
        <span className="mapnode-label">{n.label}</span>
      </button>
    );
  }

  if (n.state === 'reached') {
    return (
      <div className={`mapnode reached fam-${n.family ?? ''}`} style={style} title={n.label}>
        <span className="mapnode-label">{n.label}</span>
        <span className="mapnode-prompt">{n.prompt}</span>
        {variant === 'child' && <span className="mapnode-given">{n.given ?? '—'}</span>}
      </div>
    );
  }

  // Parent-only states: frontier (glowing) and locked (muted), both named, θ in
  // the tooltip — the instrument, not a report card (the-map §6).
  const title = n.theta != null ? `θ ${n.theta.toFixed(2)} · åk ${n.year ?? ''}` : n.label;
  return (
    <div className={`mapnode ${n.state}`} style={style} title={title}>
      <span className="mapnode-label">{n.label}</span>
    </div>
  );
}
