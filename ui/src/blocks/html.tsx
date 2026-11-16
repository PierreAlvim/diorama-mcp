import { treeDepths } from "../../../shared/lint";
import type { BlockOf, Level } from "../../../shared/schema";
import { BlockFrame, Control, Mark, useView, withClass } from "../ctx";

function LevelChip({ name, level }: { name: string; level?: Level }) {
  if (!level) return null;
  return <span className={`chip ${level}`}>{name} <b>{level}</b></span>;
}

export function Cards({ block }: { block: BlockOf<"cards"> }) {
  const { bind } = useView();
  return (
    <BlockFrame block={block} className="bare">
      <div className="cards">
        {block.items.map((o) => (
          <div key={o.id} {...withClass(bind(o, { block, label: o.title }), " card")}>
            <span className="card-head">
              <span className="card-title"><Mark el={o} />{o.title}</span>
              {o.recommended && <span className="badge">recommended</span>}
              <Control block={block} id={o.id} />
            </span>
            {o.summary && <span className="muted">{o.summary}</span>}
            {o.pros && o.pros.length > 0 && <ul className="pros">{o.pros.map((p, i) => <li key={i}>{p}</li>)}</ul>}
            {o.cons && o.cons.length > 0 && <ul className="cons">{o.cons.map((c, i) => <li key={i}>{c}</li>)}</ul>}
            {o.note && <span className="muted note">{o.note}</span>}
            {(o.effort || o.risk) && <span className="chips"><LevelChip name="effort" level={o.effort} /><LevelChip name="risk" level={o.risk} /></span>}
          </div>
        ))}
      </div>
    </BlockFrame>
  );
}

export function Tradeoff({ block }: { block: BlockOf<"tradeoff"> }) {
  const { activeLens, color, bind } = useView();
  const items = block.items;
  const activeId = items.some((i) => i.id === activeLens) ? activeLens! : items[0].id;
  const score = (item: string, axis: string) => block.scores.find((s) => s.item === item && s.axis === axis);
  const n = block.axes.length;
  const size = 220, c = size / 2, r = 84;
  const point = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(a) * r * (v / 5), c + Math.sin(a) * r * (v / 5)] as const;
  };
  const poly = (vals: number[]) => vals.map((v, i) => point(i, v).join(",")).join(" ");
  const col = (id: string) => color(id) ?? "var(--accent)";
  const active = items.find((o) => o.id === activeId)!;

  return (
    <BlockFrame block={block}>
      <div className="tradeoff">
        {n >= 3 && (
          <svg viewBox={`-95 -6 ${size + 190} ${size + 12}`} role="img" aria-label="Radar chart of scores">
            {[1, 2, 3, 4, 5].map((v) => <polygon key={v} points={poly(Array(n).fill(v))} fill="none" stroke="var(--line)" strokeWidth={v === 5 ? 1 : 0.5} />)}
            {block.axes.map((a, i) => {
              const [x, y] = point(i, 5.7);
              return <text key={a.id} x={x} y={y} fontSize="10.5" fill="var(--fg-2)" textAnchor={x < c - 5 ? "end" : x > c + 5 ? "start" : "middle"} dominantBaseline="middle">{a.label}</text>;
            })}
            {[...items].sort((a, b) => Number(a.id === activeId) - Number(b.id === activeId)).map((o) => {
              const on = o.id === activeId;
              return <polygon key={o.id} points={poly(block.axes.map((a) => score(o.id, a.id)?.value ?? 0))} fill={col(o.id)} fillOpacity={on ? 0.3 : 0.04} stroke={col(o.id)} strokeWidth={on ? 2 : 1} strokeOpacity={on ? 1 : 0.5} />;
            })}
          </svg>
        )}
        <div>
          <table>
            <thead>
              <tr>
                <th />
                {items.map((o) => {
                  const { className, style, onMouseEnter, onMouseLeave } = bind(o);
                  return <th key={o.id} className={className} style={{ ...style, color: o.id === activeId ? col(o.id) : undefined }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>{o.label}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {block.axes.map((a) => (
                <tr key={a.id}>
                  <th>{a.label}</th>
                  {items.map((o) => {
                    const s = score(o.id, a.id);
                    return (
                      <td key={o.id} className={o.id === activeId ? "on" : ""} style={{ "--opt": col(o.id) } as React.CSSProperties} title={s?.reason}>
                        {s ? <span className="dots" aria-label={`${s.value} of 5`}>{"●".repeat(s.value)}<i>{"●".repeat(5 - s.value)}</i></span> : "–"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="reasons">
            {block.axes.map((a) => {
              const s = score(active.id, a.id);
              return s ? <li key={a.id}><b>{a.label}:</b> {s.reason}</li> : null;
            })}
          </ul>
        </div>
      </div>
    </BlockFrame>
  );
}

export function Steps({ block }: { block: BlockOf<"steps"> }) {
  const { bind } = useView();
  const numbered = block.numbered !== false;
  return (
    <BlockFrame block={block} className="bare">
      <ol className="steps">
        {block.items.map((it, i) => (
          <li key={it.id} {...bind(it, { block, label: it.label })}>
            <Control block={block} id={it.id} />
            <Mark el={it} />
            {numbered && <span className="num">{i + 1}.</span>}
            <span className="step-body">
              <span className="step-label">{it.label}</span>
              {it.detail && <span className={`muted detail ${block.mono ? "mono" : ""}`}>{it.detail}</span>}
              {it.note && <span className="muted detail">{it.note}</span>}
            </span>
            {it.meta && <span className="muted meta">{it.meta}</span>}
          </li>
        ))}
      </ol>
    </BlockFrame>
  );
}

export function Matrix({ block }: { block: BlockOf<"matrix"> }) {
  const { bind, answer } = useView();
  const answerable = block.rows.some((r) => answer(block, r.id));
  return (
    <BlockFrame block={block}>
      <table className="matrix">
        <thead>
          <tr>
            {answerable && <th className="ctl" />}
            <th />
            {block.columns.map((c) => <th key={c.id}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.id} {...bind(row, { block, label: row.label })}>
              {answerable && <td className="ctl"><Control block={block} id={row.id} /></td>}
              <th className={block.mono ? "mono" : ""} title={row.note}><Mark el={row} />{row.label}</th>
              {row.cells.map((cell, i) => {
                const c = typeof cell === "string" ? { v: cell } : cell;
                const b = typeof cell === "string" ? null : bind(c);
                // A row that is itself highlighted keeps its cells readable; a highlighted cell lifts its dimmed row.
                return (
                  <td key={i} className={`cell ${b && b.className.includes(" on") ? "on" : ""}`} data-change={c.change} data-status={c.status} data-heat={c.heat ? Math.round(c.heat) : undefined} title={c.note} onMouseEnter={b?.onMouseEnter} onMouseLeave={b?.onMouseLeave}>
                    {c.v === "" && c.status ? <span className="dot" data-status={c.status} /> : c.v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </BlockFrame>
  );
}

export function Tree({ block }: { block: BlockOf<"tree"> }) {
  const { bind } = useView();
  const depth = treeDepths(block.nodes);
  const parents = new Set(block.nodes.map((n) => n.parent));
  const max = Math.max(0, ...block.nodes.map((n) => n.value ?? 0));
  return (
    <BlockFrame block={block}>
      <ul className="tree">
        {block.nodes.map((n) => {
          const d = depth.get(n.id) ?? 0;
          return (
            <li key={n.id} {...bind(n, { block, label: n.label })} style={{ paddingLeft: 6 + d * 18 }}>
              {Array.from({ length: d }, (_, i) => <i key={i} className="guide" style={{ left: 12 + i * 18 }} />)}
              <Control block={block} id={n.id} />
              <Mark el={n} />
              <span className={`tree-label ${parents.has(n.id) ? "branch" : ""}`}>{n.label}</span>
              {n.note && <span className="muted tree-note">{n.note}</span>}
              {n.value !== undefined && max > 0 && (
                <span className="bar"><i style={{ width: `${(n.value / max) * 60}%` }} /><span className="muted">{n.valueLabel ?? n.value}</span></span>
              )}
              {n.meta && <span className="muted meta">{n.meta}</span>}
            </li>
          );
        })}
      </ul>
    </BlockFrame>
  );
}

export function Board({ block }: { block: BlockOf<"board"> }) {
  const { bind } = useView();
  return (
    <BlockFrame block={block} className="bare">
      <div className="board" style={{ gridTemplateColumns: `repeat(${block.columns.length}, minmax(130px, 1fr))` }}>
        {block.columns.map((col) => {
          const over = col.limit !== undefined && col.items.length > col.limit;
          return (
            <div key={col.id} className="board-col">
              <div className="board-head">
                <b>{col.label}</b>
                <span className={over ? "error" : "muted"}>{col.items.length}{col.limit !== undefined ? `/${col.limit}` : ""}</span>
              </div>
              {col.items.map((it) => (
                <div key={it.id} {...withClass(bind(it, { block, label: it.label }), " board-card")} title={it.note}>
                  <Control block={block} id={it.id} />
                  <span>{it.label}</span>
                  {(it.tag || it.status || it.change) && <span className="muted tag"><Mark el={it} />{it.tag}</span>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </BlockFrame>
  );
}

export function Quadrant({ block }: { block: BlockOf<"quadrant"> }) {
  const { bind } = useView();
  const q = block.quadrants ?? [];
  return (
    <BlockFrame block={block}>
      <div className="quad">
        <span className="quad-y">{block.y.label}</span>
        <div className="quad-plot">
          {["tl", "tr", "bl", "br"].map((pos, i) => q[i] && <span key={pos} className={`quad-name ${pos}`}>{q[i]}</span>)}
          {block.items.map((it) => (
            <span key={it.id} {...withClass(bind(it, { block, label: it.label }), ` quad-item ${it.x > 7 ? "left" : ""}`)} style={{ left: `${it.x * 10}%`, bottom: `${it.y * 10}%` }} title={it.note}>
              <i /><Mark el={it} /><span>{it.label}</span>
            </span>
          ))}
        </div>
        <div className="quad-x"><span className="muted">{block.x.low}</span><b>{block.x.label}</b><span className="muted">{block.x.high}</span></div>
      </div>
    </BlockFrame>
  );
}

export function Timeline({ block }: { block: BlockOf<"timeline"> }) {
  const { bind } = useView();
  const rows = block.tracks.map((t) => {
    let cur = 0;
    return { t, phases: t.phases.map((p) => { const start = p.start ?? cur; cur = start + p.duration; return { p, start }; }), end: cur };
  });
  const end = block.end ?? Math.max(...rows.flatMap((r) => r.phases.map((x) => x.start + x.p.duration)), ...(block.events ?? []).map((e) => e.at), 1);
  const pct = (v: number) => `${(v / end) * 100}%`;
  const stepSize = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => end / s <= 8) ?? end;
  const ticks = block.ticks ?? Array.from({ length: Math.floor(end / stepSize) + 1 }, (_, i) => ({ at: i * stepSize, label: String(i * stepSize) }));
  const global = (block.events ?? []).filter((e) => !e.track);
  return (
    <BlockFrame block={block}>
      <div className="tl">
        {global.length > 0 && (
          <div className="tl-row tl-global">
            <span />
            <div className="tl-lane">{global.map((e, i) => <span key={i} {...withClass(bind(e, { label: e.label }), " tl-flag")} style={{ left: pct(e.at) }} title={e.note}>{e.label}</span>)}</div>
          </div>
        )}
        {rows.map(({ t, phases }) => {
          const events = (block.events ?? []).filter((e) => e.track === t.id);
          const tb = bind(t);
          return (
            <div key={t.id} className={`tl-row ${events.length ? "has-events" : ""}`}>
              <span className={`tl-name ${tb.className}`} style={tb.style} onMouseEnter={tb.onMouseEnter} onMouseLeave={tb.onMouseLeave} title={t.label}>{t.label}</span>
              <div className="tl-lane">
                {ticks.map((k) => <i key={k.at} className="tl-grid" style={{ left: pct(k.at) }} />)}
                {global.map((e, i) => <i key={i} className="tl-grid strong" style={{ left: pct(e.at) }} />)}
                {phases.map(({ p, start }, i) => {
                  // A phase inherits its track's lenses and colour unless it declares its own.
                  const b = bind({ ...p, in: p.in ?? t.in }, { label: p.label });
                  return <span key={i} {...b} className={b.className + " tl-phase"} style={{ ...tb.style, left: pct(start), width: pct(p.duration) }} title={`${p.label}: ${p.duration} ${block.unit ?? ""}${p.note ? ` (${p.note})` : ""}`}><Mark el={p.status ? { status: p.status } : {}} />{p.label}</span>;
                })}
                {events.map((e, i) => <span key={i} {...withClass(bind(e, { label: e.label }), e.at > end * 0.8 ? "tl-event flip" : "tl-event")} style={e.at > end * 0.8 ? { right: pct(end - e.at) } : { left: pct(e.at) }} title={e.note}><i />{e.label}</span>)}
              </div>
            </div>
          );
        })}
        <div className="tl-row tl-axis">
          <span className="muted">{block.unit}</span>
          <div className="tl-lane">{ticks.map((k) => <span key={k.at} className={`muted ${k.at >= end ? "last" : ""}`} style={{ left: pct(k.at) }}>{k.label}</span>)}</div>
        </div>
      </div>
    </BlockFrame>
  );
}
