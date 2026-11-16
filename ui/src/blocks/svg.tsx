import dagre from "@dagrejs/dagre";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BlockOf } from "../../../shared/schema";
import { BlockFrame, SvgMark, useView } from "../ctx";

const clip = (s: string, max = 30) => (s.length > max ? s.slice(0, max - 1) + "…" : s);
const CHAR = 6.6;

/** Width of the element, so a diagram can pick the layout that fits. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const Arrow = ({ id }: { id: string }) => (
  <defs>
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <path d="M0 0 10 5 0 10z" fill="context-stroke" />
    </marker>
  </defs>
);

type Pt = { x: number; y: number };
function layoutGraph(block: BlockOf<"graph">, rankdir: "LR" | "TB") {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir, nodesep: 16, ranksep: rankdir === "LR" ? 44 : 30, marginx: 10, marginy: 10 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(block.nodes.map((n) => n.id));
  for (const n of block.nodes) {
    const chars = Math.max(clip(n.label).length, ...(n.fields ?? []).map((f) => f.length));
    g.setNode(n.id, { width: Math.max(64, chars * CHAR + 28 + (n.status ? 12 : 0)), height: 32 + (n.fields?.length ? n.fields.length * 15 + 8 : 0) });
  }
  const edges = block.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  edges.forEach((e, i) => g.setEdge(e.from, e.to, { width: (e.label?.length ?? 0) * 5.8 + 6, height: e.label ? 14 : 0, labelpos: "c" }, String(i)));
  dagre.layout(g);
  const graph = g.graph();
  return {
    width: graph.width ?? 300,
    height: graph.height ?? 100,
    nodes: block.nodes.map((n) => ({ n, ...(g.node(n.id) as Pt & { width: number; height: number }) })),
    edges: edges.map((e, i) => ({ e, ...(g.edge({ v: e.from, w: e.to, name: String(i) }) as { points: Pt[]; x?: number; y?: number; width: number }) })),
  };
}

export function Graph({ block }: { block: BlockOf<"graph"> }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  return (
    <BlockFrame block={block}>
      <div ref={ref} className="graph">{block.variant === "commits" ? <Commits block={block} width={width} /> : <Flow block={block} width={width} />}</div>
    </BlockFrame>
  );
}

function Flow({ block, width }: { block: BlockOf<"graph">; width: number }) {
  const { bind } = useView();
  // Layout with every node, so nothing moves when the highlight changes. Both directions are cheap; pick the one that fits.
  const layouts = useMemo(() => ({ LR: layoutGraph(block, "LR"), TB: layoutGraph(block, "TB") }), [block]);
  const preferred = block.direction ?? "LR";
  const dir = preferred === "LR" && width > 0 && layouts.LR.width > width * 1.35 && layouts.TB.width < layouts.LR.width ? "TB" : preferred;
  const L = layouts[dir];
  const rx = block.variant === "state" ? 16 : 5;
  const arrow = `arrow-${useMemo(() => Math.random().toString(36).slice(2, 8), [])}`;
  return (
    <svg viewBox={`0 0 ${L.width} ${L.height}`} width={L.width} role="img" aria-label={block.label ?? "Graph"}>
      <Arrow id={arrow} />
      {L.edges.map(({ e, points, x, y, width: lw }, i) => (
        <g key={i} {...bind(e, { edge: true, from: e.from, to: e.to })}>
          <path className="edge" d={"M" + points.map((p) => `${p.x} ${p.y}`).join(" L")} markerEnd={`url(#${arrow})`} strokeDasharray={e.dashed ? "5 4" : undefined} />
          {e.label && x != null && y != null && (
            <>
              <rect className="edge-bg" x={x - lw / 2} y={y - 8} width={lw} height={16} rx="3" />
              <text className="edge-label" x={x} y={y} textAnchor="middle" dominantBaseline="central">{e.label}</text>
            </>
          )}
        </g>
      ))}
      {L.nodes.map(({ n, x, y, width: w, height: h }) => {
        const left = x - w / 2, top = y - h / 2;
        return (
          <g key={n.id} {...bind(n, { block, label: n.label })}>
            <title>{n.note ? `${n.label} — ${n.note}` : n.label}</title>
            <rect className="node" x={left} y={top} width={w} height={h} rx={rx} />
            {n.fields?.length ? (
              <>
                <text className="node-title" x={x} y={top + 16} textAnchor="middle" dominantBaseline="central">{clip(n.label)}</text>
                <line className="node-rule" x1={left} x2={left + w} y1={top + 30} y2={top + 30} />
                {n.fields.map((f, i) => (
                  <text key={i} className="field" data-diff={f.startsWith("+ ") ? "added" : f.startsWith("- ") ? "removed" : f.startsWith("~ ") ? "changed" : undefined} x={left + 10} y={top + 44 + i * 15} dominantBaseline="central">{f}</text>
                ))}
              </>
            ) : (
              <text x={x + (n.status ? 7 : 0)} y={y} textAnchor="middle" dominantBaseline="central">{clip(n.label)}</text>
            )}
            {n.status && <SvgMark el={{ status: n.status }} x={left + 12} y={n.fields?.length ? top + 16 : y} />}
            {n.change && <SvgMark el={{ change: n.change }} x={left + w - 2} y={top + 2} />}
          </g>
        );
      })}
    </svg>
  );
}

/** Git history: one horizontal lane per branch, commits left to right in the order given. */
function Commits({ block, width }: { block: BlockOf<"graph">; width: number }) {
  const { bind } = useView();
  const lanes = block.lanes ?? [];
  const lab = Math.min(150, Math.max(60, ...lanes.map((l) => l.label.length * CHAR + 14)));
  const rowH = 52;
  const step = Math.max(58, Math.min(96, ((width || 700) - lab - 30) / Math.max(1, block.nodes.length - 1)));
  const W = lab + 30 + step * (block.nodes.length - 1) + 30;
  const H = lanes.length * rowH + 8;
  const pos = new Map(block.nodes.map((n, i) => [n.id, { x: lab + 20 + i * step, y: 24 + Math.max(0, lanes.findIndex((l) => l.id === n.lane)) * rowH }]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} role="img" aria-label={block.label ?? "Commit graph"}>
      {lanes.map((l, i) => (
        <g key={l.id}>
          <text className="lane-label" x={0} y={24 + i * rowH} dominantBaseline="central">{clip(l.label, 22)}</text>
          <line className="lane" x1={lab} x2={W} y1={24 + i * rowH} y2={24 + i * rowH} />
        </g>
      ))}
      {block.edges.map((e, i) => {
        const a = pos.get(e.from), z = pos.get(e.to);
        if (!a || !z) return null;
        const mid = a.x + (z.x - a.x) / 2;
        return (
          <g key={i} {...bind(e, { edge: true, from: e.from, to: e.to })}>
            <path className="edge commit-edge" d={a.y === z.y ? `M${a.x} ${a.y} L${z.x} ${z.y}` : `M${a.x} ${a.y} C${mid} ${a.y} ${mid} ${z.y} ${z.x} ${z.y}`} strokeDasharray={e.dashed ? "5 4" : undefined} />
          </g>
        );
      })}
      {block.nodes.map((n) => {
        const p = pos.get(n.id)!;
        return (
          <g key={n.id} {...bind(n, { block, label: n.note ? `${n.label} ${n.note}` : n.label })}>
            <circle className="commit" cx={p.x} cy={p.y} r="7" />
            {n.note && <text className="commit-note" x={p.x} y={p.y - 14} textAnchor="middle">{clip(n.note, Math.floor((step * 1.8) / 5.6))}</text>}
            <text className="commit-hash" x={p.x} y={p.y + 20} textAnchor="middle">{n.label}</text>
            {(n.change || n.status) && <SvgMark el={n} x={p.x + 10} y={p.y - 8} />}
          </g>
        );
      })}
    </svg>
  );
}

export function Sequence({ block }: { block: BlockOf<"sequence"> }) {
  const { bind } = useView();
  // Columns are as wide as the longest label between neighbours needs, within limits.
  const index = (id: string) => Math.max(0, block.actors.findIndex((a) => a.id === id));
  const need = Math.max(0, ...block.messages.map((m) => (m.label.length * 5.9 + 20) / Math.max(1, Math.abs(index(m.to) - index(m.from)))));
  const colW = Math.round(Math.min(200, Math.max(150, need)));
  const rowH = 30, head = 30;
  const W = colW * block.actors.length;
  const H = head + 14 + block.messages.length * rowH + 10;
  const cx = (id: string) => index(id) * colW + colW / 2;
  const arrow = `seq-${useMemo(() => Math.random().toString(36).slice(2, 8), [])}`;
  return (
    <BlockFrame block={block}>
      <div className="graph">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} role="img" aria-label={block.label ?? "Sequence diagram"}>
          <Arrow id={arrow} />
          {block.actors.map((a) => (
            <g key={a.id}>
              <line className="lifeline" x1={cx(a.id)} x2={cx(a.id)} y1={head} y2={H} />
              <rect className="node" x={cx(a.id) - 65} y={1} width={130} height={head - 2} rx="5" />
              <text className="node-title" x={cx(a.id)} y={head / 2} textAnchor="middle" dominantBaseline="central">{clip(a.label, 19)}</text>
            </g>
          ))}
          {block.messages.map((m, i) => {
            const y = head + 14 + (i + 1) * rowH - 8;
            const x1 = cx(m.from), x2 = cx(m.to);
            const self = m.from === m.to;
            return (
              <g key={i} {...bind(m, { edge: true, label: m.label })}>
                <title>{m.note ?? m.label}</title>
                {self ? (
                  <>
                    <path className="edge" d={`M${x1} ${y - 12} h28 v12 h-24`} markerEnd={`url(#${arrow})`} />
                    <text className="msg" x={x1 + 34} y={y - 5} dominantBaseline="central">{clip(m.label, 22)}</text>
                  </>
                ) : (
                  <>
                    <path className="edge" d={`M${x1} ${y} L${x2 + (x2 > x1 ? -2 : 2)} ${y}`} markerEnd={`url(#${arrow})`} strokeDasharray={m.reply ? "5 4" : undefined} />
                    <text className="msg" x={(x1 + x2) / 2} y={y - 7} textAnchor="middle">{clip(m.label, Math.floor((Math.abs(x2 - x1) - 12) / 5.8))}</text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </BlockFrame>
  );
}

const SERIES = ["var(--fg-2)", "var(--accent)", "#3fb68b", "#e8884a"];

export function Chart({ block }: { block: BlockOf<"chart"> }) {
  const W = 640, plotH = 170, left = 44, top = 8, bottom = 22;
  const plotW = W - left - 8;
  // Round the scale up to a "nice" number so the grid lines read as whole values.
  const raw = Math.max(1e-9, ...block.series.flatMap((s) => s.values)) / 3.6;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const max = Math.ceil(raw / pow) * pow * 4;
  const Y = (v: number) => top + plotH - (v / max) * plotH;
  const groupW = plotW / block.categories.length;
  const barW = Math.min(44, (groupW - 20) / block.series.length);
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  return (
    <BlockFrame block={block}>
      <div className="legend">
        {block.series.map((s, i) => <span key={s.id} style={{ "--opt": SERIES[i % SERIES.length] } as React.CSSProperties}>{s.label}</span>)}
        {block.unit && <span className="unit muted">{block.unit}</span>}
      </div>
      <div className="graph">
        <svg className="chart" viewBox={`0 0 ${W} ${top + plotH + bottom}`} width={W} role="img" aria-label={block.label ?? "Chart"}>
          {[0, 1, 2, 3, 4].map((t) => (
            <g key={t}>
              <line className={t ? "grid" : "axis"} x1={left} x2={W - 8} y1={Y((max * t) / 4)} y2={Y((max * t) / 4)} />
              <text className="tick" x={left - 6} y={Y((max * t) / 4)} textAnchor="end" dominantBaseline="central">{fmt((max * t) / 4)}</text>
            </g>
          ))}
          {block.categories.map((c, ci) => <text key={ci} className="cat" x={left + ci * groupW + groupW / 2} y={top + plotH + 14} textAnchor="middle">{clip(c, Math.floor(groupW / 6))}</text>)}
          {block.series.map((s, si) => {
            const color = SERIES[si % SERIES.length];
            if (block.kind === "line") {
              const pts = s.values.map((v, ci) => [left + ci * groupW + groupW / 2, Y(v)] as const);
              return (
                <g key={s.id}>
                  <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth="2" />
                  {pts.map(([x, y], ci) => <circle key={ci} cx={x} cy={y} r="3" fill={color}><title>{`${s.label} · ${block.categories[ci]}: ${s.values[ci]}`}</title></circle>)}
                </g>
              );
            }
            return s.values.map((v, ci) => {
              const x = left + ci * groupW + (groupW - barW * block.series.length) / 2 + si * barW;
              return (
                <g key={`${s.id}-${ci}`}>
                  <rect x={x + 1} y={Y(v)} width={barW - 2} height={top + plotH - Y(v)} rx="2" fill={color}><title>{`${s.label} · ${block.categories[ci]}: ${v}`}</title></rect>
                  <text className="tick" x={x + barW / 2} y={Y(v) - 5} textAnchor="middle">{fmt(v)}</text>
                </g>
              );
            });
          })}
        </svg>
      </div>
    </BlockFrame>
  );
}
