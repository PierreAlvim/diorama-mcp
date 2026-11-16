// Wireframe renderer for the scenario catalogue (docs/cenarios.md).
// Turns a hypothetical tool call into a static SVG mock of the view.
// This is documentation tooling, not the real view in ui/.
import dagre from "@dagrejs/dagre";


const W = 760;
const PAD = 20;
import { applyState, initialState, stateful, states } from "../shared/state.ts";
import { emphasis } from "../ui/src/model.ts";

const C = {
  ink: "#1f2328", mute: "#6b7280", line: "#c5cad3", soft: "#f4f5f7", bg: "#ffffff",
  accent: "#2f6fde", accentSoft: "#e3edfd",
  added: "#2e9e5b", removed: "#d14b4b", changed: "#c98a1b", affected: "#7a5cd6",
  ok: "#2e9e5b", failed: "#d14b4b", running: "#2f6fde", warn: "#c98a1b", pending: "#9aa1ac", blocked: "#7c5cc4", skipped: "#9aa1ac",
};
const GLYPH = { added: "+", removed: "−", changed: "~", affected: "!" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fit = (s, w, fs = 11) => {
  s = String(s);
  const max = Math.max(2, Math.floor(w / (fs * 0.56)));
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
};
function wrap(s, w, fs = 11, maxLines = 2) {
  const max = Math.max(4, Math.floor(w / (fs * 0.56)));
  const lines = [];
  let cur = "";
  for (const word of String(s).split(/\s+/)) {
    const next = (cur + " " + word).trim();
    if (next.length > max && cur) { lines.push(cur); cur = word; } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = fit(lines[maxLines - 1] + " …", w, fs); }
  return lines;
}
const text = (x, y, s, o = {}) =>
  `<text x="${r(x)}" y="${r(y)}" font-size="${o.size ?? 11}" fill="${o.fill ?? C.ink}"` +
  (o.bold ? ` font-weight="600"` : "") + (o.anchor ? ` text-anchor="${o.anchor}"` : "") +
  (o.mono ? ` font-family="ui-monospace, Menlo, Consolas, monospace"` : "") +
  (o.opacity != null ? ` opacity="${o.opacity}"` : "") + `>${esc(s)}</text>`;
const rect = (x, y, w, h, o = {}) =>
  `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${o.rx ?? 4}" fill="${o.fill ?? C.bg}"` +
  (o.fillOpacity != null ? ` fill-opacity="${o.fillOpacity}"` : "") +
  ` stroke="${o.stroke ?? C.line}" stroke-width="${o.sw ?? 1}"` +
  (o.dash ? ` stroke-dasharray="${o.dash}"` : "") + (o.opacity != null ? ` opacity="${o.opacity}"` : "") + `/>`;
const line = (x1, y1, x2, y2, o = {}) =>
  `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${o.stroke ?? C.line}" stroke-width="${o.sw ?? 1}"` +
  (o.dash ? ` stroke-dasharray="${o.dash}"` : "") + (o.opacity != null ? ` opacity="${o.opacity}"` : "") + `/>`;
const r = (n) => Math.round(n * 10) / 10;

function arrowHead(x1, y1, x2, y2, color) {
  const a = Math.atan2(y2 - y1, x2 - x1), s = 6;
  const p = (da) => `${r(x2 - s * Math.cos(a + da))},${r(y2 - s * Math.sin(a + da))}`;
  return `<polygon points="${r(x2)},${r(y2)} ${p(0.4)} ${p(-0.4)}" fill="${color}"/>`;
}

// 'on' = highlighted, 'off' = dimmed, 'neutral' = untouched. Same rule as the view (ui/src/model.ts).
const emph = (el, ctx, isEdge) => emphasis(el, ctx.fx, isEdge);
function look(el, ctx, isEdge) {
  const e = emph(el, ctx, isEdge);
  const mk = el.change ? C[el.change] : el.status ? C[el.status] : null;
  return {
    e, mk,
    stroke: mk ?? (e === "on" ? C.accent : isEdge ? C.mute : C.line),
    fill: mk ?? (e === "on" ? C.accent : C.bg),
    fillOpacity: mk || e === "on" ? 0.1 : 1,
    sw: mk || e === "on" ? 1.6 : 1,
    dash: el.change === "removed" ? "4 3" : null,
    opacity: e === "off" ? 0.42 : 1,
  };
}
const badge = (x, y, el) => {
  if (el.change) return `<circle cx="${r(x)}" cy="${r(y)}" r="7" fill="${C[el.change]}"/>` + text(x, y + 3.5, GLYPH[el.change], { size: 11, fill: "#fff", anchor: "middle", bold: true });
  if (el.status) return statusDot(x, y, el.status);
  return "";
};
const statusDot = (x, y, st) =>
  st === "running"
    ? `<circle cx="${r(x)}" cy="${r(y)}" r="4" fill="none" stroke="${C.running}" stroke-width="2.4" stroke-dasharray="5 3"/>`
    : st === "pending"
      ? `<circle cx="${r(x)}" cy="${r(y)}" r="4.5" fill="${C.bg}" stroke="${C.pending}" stroke-width="1.6"/>`
      : `<circle cx="${r(x)}" cy="${r(y)}" r="5" fill="${C[st]}"/>`;

// ---- response controls -------------------------------------------------
function answers(ctx, blockId) {
  const rs = ctx.resp;
  if (!rs || !rs.of) return null;
  const of = Array.isArray(rs.of) ? rs.of : [rs.of];
  return of.includes(blockId) ? rs.type : null;
}
function control(x, y, type, pick) {
  if (type === "choose_one")
    return { w: 20, s: `<circle cx="${x + 7}" cy="${y}" r="6" fill="${C.bg}" stroke="${pick ? C.accent : C.mute}" stroke-width="1.4"/>` + (pick ? `<circle cx="${x + 7}" cy="${y}" r="3" fill="${C.accent}"/>` : "") };
  if (type === "choose_many")
    return { w: 20, s: rect(x + 1, y - 6, 12, 12, { rx: 2, stroke: pick ? C.accent : C.mute, fill: pick ? C.accent : C.bg, sw: 1.4 }) + (pick ? text(x + 7, y + 4, "✓", { size: 10, fill: "#fff", anchor: "middle", bold: true }) : "") };
  // approve: ✓ / ✗ pair
  const ok = pick === "ok", no = pick === "no";
  return {
    w: 40,
    s: rect(x, y - 7, 15, 14, { rx: 3, stroke: ok ? C.ok : C.line, fill: ok ? C.ok : C.bg }) + text(x + 7.5, y + 4, "✓", { size: 10, fill: ok ? "#fff" : C.mute, anchor: "middle", bold: true }) +
      rect(x + 18, y - 7, 15, 14, { rx: 3, stroke: no ? C.failed : C.line, fill: no ? C.failed : C.bg }) + text(x + 25.5, y + 4, "✗", { size: 10, fill: no ? "#fff" : C.mute, anchor: "middle", bold: true }),
  };
}
const pickOf = (ctx, type, blockId, id) => {
  const p = ctx.sample.picks ?? {};
  return type === "choose_one" ? (p[blockId] ?? ctx.sample.pick) === id : p[id];
};

// ---- blocks ------------------------------------------------------------
const B = {};

B.cards = (b, x, y, w, ctx) => {
  const n = b.items.length, gap = 10, cw = (w - gap * (n - 1)) / n, tw = cw - 20;
  const type = answers(ctx, b.id);
  const laid = b.items.map((it) => {
    const sum = wrap(it.summary ?? "", tw, 10.5, 3);
    const pros = (it.pros ?? []).slice(0, 2), cons = (it.cons ?? []).slice(0, 2);
    return { it, sum, pros, cons, h: 30 + sum.length * 13 + (pros.length + cons.length) * 13 + (pros.length + cons.length ? 8 : 0) + (it.effort || it.risk ? 16 : 0) + (it.recommended ? 13 : 0) + 8 };
  });
  const h = Math.max(...laid.map((l) => l.h));
  let s = "";
  laid.forEach(({ it, sum, pros, cons }, i) => {
    const cx = x + i * (cw + gap), lk = look(it, ctx);
    const picked = type && pickOf(ctx, type, b.id, it.id);
    s += `<g opacity="${lk.opacity}">` + rect(cx, y, cw, h, { rx: 6, stroke: picked ? C.accent : lk.stroke, sw: picked ? 2 : lk.sw, fill: lk.e === "on" ? C.accentSoft : C.bg });
    let ty = y + 19;
    s += text(cx + 10, ty, fit(it.title, tw - (type ? 20 : 0), 12), { size: 12, bold: true });
    if (type) s += control(cx + cw - 24, y + 15, type, picked).s;
    if (it.recommended) { ty += 13; s += text(cx + 10, ty, "★ recommended", { size: 9.5, fill: C.accent, bold: true }); }
    for (const l of sum) { ty += 13; s += text(cx + 10, ty, l, { size: 10.5, fill: C.mute }); }
    ty += 6;
    for (const p of pros) { ty += 13; s += text(cx + 10, ty, "+ " + fit(p, tw - 10, 10.5), { size: 10.5, fill: C.added }); }
    for (const c of cons) { ty += 13; s += text(cx + 10, ty, "− " + fit(c, tw - 10, 10.5), { size: 10.5, fill: C.removed }); }
    if (it.effort || it.risk) s += text(cx + 10, y + h - 9, [it.effort && `effort: ${it.effort}`, it.risk && `risk: ${it.risk}`].filter(Boolean).join("  ·  "), { size: 9.5, fill: C.mute });
    s += `</g>`;
  });
  return { s, h };
};

B.tradeoff = (b, x, y, w, ctx) => {
  const items = b.items, lab = 150, col = 78, rh = 24;
  const active = ctx.lens ?? items[0].id;
  let s = "";
  items.forEach((it, i) => { s += text(x + lab + i * col + col / 2, y + 14, fit(it.label, col - 6, 10.5), { size: 10.5, anchor: "middle", bold: it.id === active, fill: it.id === active ? C.accent : C.ink }); });
  const rx = x + lab + items.length * col + 14;
  s += text(rx, y + 14, `why (${items.find((i) => i.id === active).label})`, { size: 10, fill: C.mute });
  b.axes.forEach((ax, ai) => {
    const ry = y + rh * (ai + 1);
    s += line(x, ry, x + w, ry) + text(x, ry + 16, fit(ax.label, lab - 6), {});
    items.forEach((it, i) => {
      const sc = b.scores.find((q) => q.item === it.id && q.axis === ax.id);
      const cx0 = x + lab + i * col + col / 2 - 24;
      for (let d = 0; d < 5; d++) s += `<circle cx="${cx0 + d * 12}" cy="${ry + 12}" r="4" fill="${d < (sc?.value ?? 0) ? (it.id === active ? C.accent : C.mute) : C.bg}" stroke="${it.id === active ? C.accent : C.line}"/>`;
      if (it.id === active && sc) s += text(rx, ry + 16, fit(sc.reason, x + w - rx, 10), { size: 10, fill: C.mute });
    });
  });
  return { s, h: rh * (b.axes.length + 1) };
};

B.graph = (b, x, y, w, ctx) => {
  if (b.variant === "commits") return commits(b, x, y, w, ctx);
  const dir = b.direction ?? "LR";
  const tries = dir === "LR" ? [["LR", 42], ["LR", 22], ["TB", 26]] : [["TB", 34]];
  let best = null;
  for (const [rankdir, ranksep] of tries) {
    const out = layoutGraph(b, rankdir, ranksep);
    const { width, height } = out.graph();
    const sc = Math.min(1, w / width), score = height * sc > 560 ? sc * 0.6 : sc;
    if (!best || score > best.score + 0.02) best = { g: out, score };
    if (sc >= 0.9) break;
  }
  const g = best.g;
  return drawGraph(b, g, x, y, w, ctx);
};
function layoutGraph(b, rankdir, ranksep) {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir, nodesep: 16, ranksep, marginx: 10, marginy: 10 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of b.nodes) {
    const chars = Math.max(n.label.length, ...(n.fields ?? []).map((f) => f.length));
    g.setNode(n.id, { width: Math.max(62, chars * 6.3 + 26), height: 28 + (n.fields?.length ?? 0) * 14 + (n.fields ? 6 : 0) });
  }
  b.edges.forEach((e, i) => g.setEdge(e.from, e.to, { width: (e.label?.length ?? 0) * 5.6 + 4, height: e.label ? 14 : 0, labelpos: "c" }, "e" + i));
  dagre.layout(g);
  return g;
}
function drawGraph(b, g, x, y, w, ctx) {
  const { width: gw, height: gh } = g.graph();
  const sc = Math.min(1, w / gw), ox = x + (w - gw * sc) / 2;
  let s = "";
  b.edges.forEach((e, i) => {
    const ed = g.edge(e.from, e.to, "e" + i), lk = look(e, ctx, true), pts = ed.points;
    s += `<g opacity="${lk.opacity}"><polyline points="${pts.map((p) => `${r(p.x)},${r(p.y)}`).join(" ")}" fill="none" stroke="${lk.stroke}" stroke-width="${lk.sw}" stroke-linejoin="round"${lk.dash ? ` stroke-dasharray="${lk.dash}"` : ""}/>`;
    const a = pts[pts.length - 2], z = pts[pts.length - 1];
    s += arrowHead(a.x, a.y, z.x, z.y, lk.stroke);
    if (e.label) s += rect(ed.x - ed.width / 2, ed.y - 8, ed.width, 15, { stroke: "none", fill: C.bg, rx: 2 }) + text(ed.x, ed.y + 3.5, e.label, { size: 9.5, fill: lk.mk ?? C.mute, anchor: "middle" });
    s += `</g>`;
  });
  for (const n of b.nodes) {
    const p = g.node(n.id), lk = look(n, ctx), nx = p.x - p.width / 2, ny = p.y - p.height / 2;
    s += `<g opacity="${lk.opacity}">` + rect(nx, ny, p.width, p.height, { rx: b.variant === "state" ? 14 : 5, stroke: lk.stroke, sw: lk.sw, dash: lk.dash, fill: lk.e === "on" && !lk.mk ? C.accentSoft : C.bg });
    if (lk.mk) s += rect(nx, ny, p.width, p.height, { rx: b.variant === "state" ? 14 : 5, stroke: "none", fill: lk.mk, fillOpacity: 0.1 });
    if (n.fields) {
      s += text(p.x, ny + 18, n.label, { anchor: "middle", bold: true }) + line(nx, ny + 26, nx + p.width, ny + 26, { stroke: lk.stroke });
      n.fields.forEach((f, i) => {
        const col = f.startsWith("+ ") ? C.added : f.startsWith("- ") ? C.removed : f.startsWith("~ ") ? C.changed : C.mute;
        s += text(nx + 9, ny + 40 + i * 14, f, { size: 10, fill: col, mono: true });
      });
    } else s += text(p.x + (n.status ? 6 : 0), p.y + 4, n.label, { anchor: "middle" });
    if (n.status) s += statusDot(nx + 11, p.y, n.status);
    if (n.change) s += badge(nx + p.width - 2, ny + 2, n);
    s += `</g>`;
  }
  return { s: `<g transform="translate(${r(ox)},${r(y)}) scale(${r(sc * 100) / 100})">${s}</g>`, h: gh * sc };
}

function commits(b, x, y, w, ctx) {
  const lab = 96, rowH = 46, step = Math.min(64, (w - lab - 20) / Math.max(1, b.nodes.length - 1));
  const pos = {};
  let s = "";
  b.lanes.forEach((l, i) => {
    const ly = y + 18 + i * rowH;
    s += text(x, ly + 4, fit(l.label, lab - 8), { bold: true, size: 10.5 }) + line(x + lab, ly, x + w, ly, { dash: "2 4" });
  });
  b.nodes.forEach((n, i) => { pos[n.id] = { x: x + lab + 14 + i * step, y: y + 18 + b.lanes.findIndex((l) => l.id === n.lane) * rowH }; });
  for (const e of b.edges) {
    const a = pos[e.from], z = pos[e.to], lk = look(e, ctx, true);
    const d = a.y === z.y ? `M${r(a.x)},${r(a.y)} L${r(z.x)},${r(z.y)}` : `M${r(a.x)},${r(a.y)} C${r(a.x + (z.x - a.x) / 2)},${r(a.y)} ${r(a.x + (z.x - a.x) / 2)},${r(z.y)} ${r(z.x)},${r(z.y)}`;
    s += `<path d="${d}" fill="none" stroke="${lk.stroke}" stroke-width="${lk.sw + 0.6}" opacity="${lk.opacity}"${e.dashed ? ` stroke-dasharray="5 4"` : ""}/>`;
  }
  for (const n of b.nodes) {
    const p = pos[n.id], lk = look(n, ctx);
    s += `<g opacity="${lk.opacity}"><circle cx="${r(p.x)}" cy="${r(p.y)}" r="7" fill="${lk.e === "on" || lk.mk ? lk.stroke : C.bg}" stroke="${lk.e === "neutral" && !lk.mk ? C.mute : lk.stroke}" stroke-width="1.8"/>` +
      text(p.x, p.y + 21, n.label, { size: 9, anchor: "middle", mono: true, fill: C.mute }) +
      (n.note ? text(p.x, p.y - 12, fit(n.note, step * 1.9, 9), { size: 9, anchor: "middle", fill: lk.mk ?? C.ink }) : "") + `</g>`;
  }
  return { s, h: b.lanes.length * rowH + 6 };
}

B.timeline = (b, x, y, w, ctx) => {
  const trackEv = (b.events ?? []).some((e) => e.track);
  const lab = 132, rowH = trackEv ? 40 : 30, top = (b.events ?? []).some((e) => !e.track) ? 16 : trackEv ? 8 : 0;
  let end = 0;
  const rows = b.tracks.map((t) => {
    let cur = 0;
    const phases = t.phases.map((p) => { const st = p.start ?? cur; cur = st + p.duration; end = Math.max(end, cur); return { ...p, st }; });
    return { t, phases };
  });
  end = b.end ?? end;
  const k = (w - lab - 6) / end, X = (v) => x + lab + v * k;
  const hBody = rows.length * rowH;
  let s = "";
  const ticks = b.ticks ?? Array.from({ length: Math.floor(end / Math.ceil(end / 8)) + 1 }, (_, i) => ({ at: i * Math.ceil(end / 8), label: String(i * Math.ceil(end / 8)) }));
  for (const tk of ticks) s += line(X(tk.at), y + top, X(tk.at), y + top + hBody, { dash: "2 3" }) + text(X(tk.at), y + top + hBody + 13, tk.label, { size: 9.5, fill: C.mute, anchor: "middle" });
  s += text(x, y + top + hBody + 13, b.unit ?? "", { size: 9.5, fill: C.mute });
  rows.forEach(({ t, phases }, i) => {
    const ry = y + top + i * rowH, lt = look(t, ctx);
    const by = ry + rowH - 25;
    s += `<g>` + text(x, by + 14, fit(t.label, lab - 8), { bold: lt.e === "on", fill: lt.e === "on" ? C.accent : C.ink, opacity: ctx.focus ? 1 : lt.opacity });
    for (const p of phases) {
      const lk = look({ ...p, emphasis: p.emphasis ?? t.emphasis, id: p.id ?? t.id }, ctx), pw = Math.max(3, p.duration * k - 2);
      s += `<g opacity="${lk.opacity}">` + rect(X(p.st), by, pw, 20, { stroke: lk.stroke, sw: lk.sw, fill: lk.mk ?? (lk.e === "on" ? C.accent : C.soft), fillOpacity: lk.mk ? 0.18 : lk.e === "on" ? 0.14 : 1 }) +
        (pw > 22 ? text(X(p.st) + 6, by + 14, fit(p.label, pw - 8, 10), { size: 10 }) : "") + `</g>`;
    }
    s += `</g>`;
  });
  for (const ev of b.events ?? []) {
    const lk = look(ev, ctx), ex = X(ev.at);
    if (ev.track) {
      const ry = y + top + b.tracks.findIndex((t) => t.id === ev.track) * rowH + rowH - 15;
      s += `<g opacity="${lk.opacity}"><polygon points="${r(ex)},${r(ry - 7)} ${r(ex + 7)},${r(ry)} ${r(ex)},${r(ry + 7)} ${r(ex - 7)},${r(ry)}" fill="${lk.mk ?? C.ink}" stroke="${C.bg}"/>` +
        text(ex, ry - 14, ev.label, { size: 9.5, fill: lk.mk ?? C.ink, bold: true, anchor: ex > x + w - 60 ? "end" : "middle" }) + `</g>`;
    } else s += line(ex, y + top - 2, ex, y + top + hBody, { stroke: lk.mk ?? C.ink, sw: 1.4, dash: "5 3" }) + text(ex + 4, y + 9, ev.label, { size: 9.5, fill: lk.mk ?? C.ink, bold: true });
  }
  return { s, h: top + hBody + 20 };
};

/** Tree blocks are a flat list with `parent`; rows carry their depth and whether they have children. */
function treeRows(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Set(nodes.map((n) => n.parent));
  return nodes.map((n) => {
    let depth = 0;
    for (let p = n.parent; p !== undefined; p = byId.get(p)?.parent) depth++;
    return { n, depth, branch: parents.has(n.id) };
  });
}
B.tree = (b, x, y, w, ctx) => {
  const rows = treeRows(b.nodes), rowH = 23, ind = 20, type = answers(ctx, b.id), pd = ctx.resp?.depth ?? 1;
  const hasVal = rows.some((q) => q.n.value != null), maxVal = Math.max(1, ...rows.map((q) => q.n.value ?? 0));
  const valW = hasVal ? 130 : 0, metaW = rows.some((q) => q.n.meta) ? 150 : 0;
  let s = "";
  rows.forEach(({ n, depth, branch }, i) => {
    const ry = y + i * rowH, lk = look(n, ctx);
    let tx = x + depth * ind;
    if (depth > 0) s += line(tx - ind + 6, ry - rowH / 2 + 6, tx - ind + 6, ry + 12) + line(tx - ind + 6, ry + 12, tx - 3, ry + 12);
    s += `<g opacity="${lk.opacity}">`;
    if (lk.e === "on") s += rect(tx - 2, ry + 2, w - (tx - x) + 2, rowH - 3, { stroke: "none", fill: C.accentSoft });
    if (type && depth === pd) { const c = control(tx + 2, ry + 12, type, pickOf(ctx, type, b.id, n.id)); s += c.s; tx += c.w; }
    if (n.change || n.status) { s += badge(tx + 8, ry + 12, n); tx += 20; }
    const avail = x + w - tx - valW - metaW - 6, lab = fit(n.label, avail, 11);
    s += text(tx + 2, ry + 16, lab, { bold: depth === 0 || branch, fill: lk.mk && !n.status ? lk.mk : C.ink });
    if (n.note) s += text(tx + 2 + lab.length * 6.3 + 10, ry + 16, fit(n.note, avail - lab.length * 6.3 - 12, 10), { size: 10, fill: C.mute });
    if (n.value != null) {
      const bx = x + w - metaW - valW;
      s += rect(bx, ry + 7, (valW - 40) * (n.value / maxVal), 10, { stroke: "none", fill: lk.mk ?? C.mute, fillOpacity: 0.55, rx: 2 }) + text(bx + (valW - 40) * (n.value / maxVal) + 4, ry + 16, n.valueLabel ?? String(n.value), { size: 9.5, fill: C.mute });
    }
    if (n.meta) s += text(x + w, ry + 16, fit(n.meta, metaW, 10), { size: 10, fill: C.mute, anchor: "end" });
    s += `</g>`;
  });
  return { s, h: rows.length * rowH + 2 };
};

B.matrix = (b, x, y, w, ctx) => {
  const type = answers(ctx, b.id), cw0 = type ? (type === "approve" ? 40 : 22) : 0;
  const lab = Math.min(300, Math.max(100, ...b.rows.map((q) => q.label.length * (b.mono ? 7 : 6.2) + 34))), cols = b.columns, colW = (w - lab - cw0) / cols.length, hh = 26, rh = b.rows.some((q) => q.cells.some((c) => c?.heat != null && c.v.length <= 2)) ? 30 : 25;
  let s = rect(x, y, w, hh, { stroke: "none", fill: C.soft });
  cols.forEach((c, i) => { s += text(x + cw0 + lab + i * colW + colW / 2, y + 17, fit(c.label, colW - 6, 10.5), { size: 10.5, bold: true, anchor: "middle" }); });
  b.rows.forEach((row, ri) => {
    const ry = y + hh + ri * rh, lk = look(row, ctx);
    const cellHit = (c) => ctx.hover && typeof c === "object" && c !== null && c.id === ctx.hover;
    if (row.cells.some(cellHit)) { lk.opacity = 1; lk.e = "neutral"; }
    s += line(x, ry, x + w, ry) + `<g opacity="${lk.opacity}">`;
    if (lk.e === "on") s += rect(x, ry + 1, w, rh - 1, { stroke: "none", fill: C.accentSoft });
    if (type) s += control(x + 2, ry + rh / 2, type, pickOf(ctx, type, b.id, row.id)).s;
    let lx = x + cw0 + 4;
    if (row.change || row.status) { s += badge(lx + 6, ry + rh / 2, row); lx += 18; }
    s += text(lx, ry + rh / 2 + 4, fit(row.label, lab - (lx - x - cw0) - 4), { mono: b.mono });
    row.cells.forEach((cell, ci) => {
      const c = typeof cell === "object" && cell !== null ? cell : { v: cell };
      const cx = x + cw0 + lab + ci * colW, mk = c.change ? C[c.change] : c.status ? C[c.status] : null;
      if (c.heat) s += rect(cx + 1, ry + 1, colW - 2, rh - 2, { stroke: "none", fill: C.failed, fillOpacity: Math.min(0.85, c.heat * 0.17), rx: 2 });
      if (mk) s += rect(cx + 2, ry + 2, colW - 4, rh - 4, { stroke: mk, fill: mk, fillOpacity: 0.12, rx: 3, dash: c.change === "removed" ? "3 2" : null });
      const v = c.v ?? "";
      if (cellHit(c)) s += rect(cx + 2, ry + 2, colW - 4, rh - 4, { stroke: C.accent, sw: 2.2, fill: "none", rx: 3 });
      if (c.status && v === "") s += statusDot(cx + colW / 2, ry + rh / 2, c.status);
      else s += text(cx + colW / 2, ry + rh / 2 + 4, fit(v, colW - 6, 10.5), { size: 10.5, anchor: "middle", fill: c.heat >= 4 ? "#fff" : mk ?? C.ink, bold: !!mk || c.heat >= 4 });
    });
    s += `</g>`;
  });
  const h = hh + b.rows.length * rh;
  return { s: s + rect(x, y, w, h, { fill: "none" }), h };
};

B.steps = (b, x, y, w, ctx) => {
  const type = answers(ctx, b.id);
  let s = "", cy = y;
  b.items.forEach((it, i) => {
    const rh = it.detail ? 40 : 26, lk = look(it, ctx);
    s += `<g opacity="${lk.opacity}">` + rect(x, cy, w, rh - 4, { stroke: lk.e === "on" ? C.accent : C.line, fill: lk.e === "on" ? C.accentSoft : C.bg, sw: lk.e === "on" ? 1.6 : 1 });
    let tx = x + 8;
    if (type) { const c = control(tx, cy + (rh - 4) / 2, type, pickOf(ctx, type, b.id, it.id)); s += c.s; tx += c.w; }
    if (it.status || it.change) { s += badge(tx + 6, cy + (rh - 4) / 2, it); tx += 20; }
    if (b.numbered !== false) { s += text(tx, cy + 15, `${i + 1}.`, { fill: C.mute }); tx += 20; }
    const metaW = it.meta ? Math.min(220, it.meta.length * 6 + 10) : 0;
    s += text(tx, cy + 15, fit(it.label, x + w - tx - metaW - 10, 11.5), { bold: true });
    if (it.detail) s += text(tx, cy + 29, fit(it.detail, x + w - tx - 12, 10), { size: 10, fill: C.mute, mono: b.mono });
    if (it.meta) s += text(x + w - 8, cy + 15, it.meta, { size: 10, fill: C.mute, anchor: "end" });
    s += `</g>`;
    cy += rh;
  });
  return { s, h: cy - y };
};

B.sequence = (b, x, y, w, ctx) => {
  const n = b.actors.length, colW = w / n, cx = (id) => x + b.actors.findIndex((a) => a.id === id) * colW + colW / 2, rowH = 28;
  const h = 34 + b.messages.length * rowH + 10;
  let s = "";
  for (const a of b.actors) s += line(cx(a.id), y + 26, cx(a.id), y + h, { dash: "3 3" }) + rect(cx(a.id) - Math.min(colW - 12, 110) / 2, y, Math.min(colW - 12, 110), 26, { rx: 5 }) + text(cx(a.id), y + 17, fit(a.label, Math.min(colW - 16, 104)), { anchor: "middle", bold: true });
  b.messages.forEach((m, i) => {
    const my = y + 34 + (i + 1) * rowH - 6, lk = look(m, ctx, true), x1 = cx(m.from), x2 = cx(m.to);
    s += `<g opacity="${lk.opacity}">`;
    if (m.from === m.to) s += `<path d="M${r(x1)},${r(my - 10)} h26 v10 h-20" fill="none" stroke="${lk.stroke}" stroke-width="${lk.sw}"/>` + arrowHead(x1 + 26, my, x1 + 6, my, lk.stroke) + text(x1 + 32, my - 2, m.label, { size: 10, fill: lk.mk ?? C.ink });
    else {
      const dir = x2 > x1 ? 1 : -1;
      s += line(x1, my, x2 - dir * 2, my, { stroke: lk.stroke, sw: lk.sw, dash: m.reply ? "5 3" : lk.dash }) + arrowHead(x1, my, x2, my, lk.stroke) +
        text((x1 + x2) / 2, my - 5, fit(m.label, Math.abs(x2 - x1) - 10, 10), { size: 10, anchor: "middle", fill: lk.mk ?? (lk.e === "on" ? C.accent : C.ink) });
    }
    s += `</g>`;
  });
  return { s, h };
};

B.quadrant = (b, x, y, w, ctx) => {
  const type = answers(ctx, b.id), ml = 34, mb = 30, ph = 250, pw = w - ml, px = x + ml;
  const X = (v) => px + (v / 10) * pw, Y = (v) => y + ph - (v / 10) * ph;
  let s = rect(px, y, pw, ph, { fill: C.bg }) + line(px + pw / 2, y, px + pw / 2, y + ph, { dash: "4 4" }) + line(px, y + ph / 2, px + pw, y + ph / 2, { dash: "4 4" });
  const q = b.quadrants ?? [];
  [[px + 8, y + 16, "start"], [px + pw - 8, y + 16, "end"], [px + 8, y + ph - 8, "start"], [px + pw - 8, y + ph - 8, "end"]].forEach(([qx, qy, a], i) => { if (q[i]) s += text(qx, qy, q[i], { size: 10, fill: C.mute, anchor: a, bold: true }); });
  s += text(px, y + ph + 14, b.x.low ?? "", { size: 9.5, fill: C.mute }) + text(px + pw, y + ph + 14, b.x.high ?? "", { size: 9.5, fill: C.mute, anchor: "end" }) + text(px + pw / 2, y + ph + 24, b.x.label, { size: 10.5, anchor: "middle", bold: true });
  s += `<text transform="translate(${r(x + 12)},${r(y + ph / 2)}) rotate(-90)" font-size="10.5" font-weight="600" text-anchor="middle" fill="${C.ink}">${esc(b.y.label)}</text>`;
  for (const it of b.items) {
    const lk = look(it, ctx), picked = type && pickOf(ctx, type, b.id, it.id), ix = X(it.x), iy = Y(it.y);
    s += `<g opacity="${lk.opacity}"><circle cx="${r(ix)}" cy="${r(iy)}" r="6" fill="${picked ? C.accent : C.bg}" stroke="${picked ? C.accent : C.mute}" stroke-width="1.6"/>` +
      text(ix + (it.x > 7.5 ? -10 : 10), iy + 4, it.label, { size: 10, anchor: it.x > 7.5 ? "end" : "start", bold: !!picked, fill: picked ? C.accent : C.ink }) + `</g>`;
  }
  return { s, h: ph + mb };
};

B.board = (b, x, y, w, ctx) => {
  const n = b.columns.length, gap = 8, cw = (w - gap * (n - 1)) / n, ch = 40;
  const rows = Math.max(...b.columns.map((c) => c.items.length));
  const h = 28 + rows * (ch + 6) + 6;
  let s = "";
  b.columns.forEach((col, ci) => {
    const cx = x + ci * (cw + gap);
    s += rect(cx, y, cw, h, { fill: C.soft, stroke: "none", rx: 6 }) + text(cx + 8, y + 18, fit(col.label, cw - 40, 10.5), { size: 10.5, bold: true }) + text(cx + cw - 8, y + 18, String(col.items.length) + (col.limit ? `/${col.limit}` : ""), { size: 10, fill: col.limit && col.items.length > col.limit ? C.failed : C.mute, anchor: "end", bold: !!(col.limit && col.items.length > col.limit) });
    col.items.forEach((it, i) => {
      const iy = y + 28 + i * (ch + 6), lk = look(it, ctx);
      s += `<g opacity="${lk.opacity}">` + rect(cx + 5, iy, cw - 10, ch, { stroke: lk.stroke, sw: lk.sw, fill: lk.e === "on" ? C.accentSoft : C.bg }) +
        text(cx + 11, iy + 16, fit(it.label, cw - 24, 10.5), { size: 10.5 }) + text(cx + 11, iy + 31, fit(it.tag ?? "", cw - 40, 9.5), { size: 9.5, fill: lk.mk ?? C.mute }) +
        (it.status ? statusDot(cx + cw - 16, iy + 28, it.status) : "") + `</g>`;
    });
  });
  return { s, h };
};

B.chart = (b, x, y, w) => {
  const ph = 160, ml = 36, pw = w - ml, px = x + ml, top = 22, palette = [C.pending, C.accent, C.added];
  const raw = Math.max(...b.series.flatMap((q) => q.values)) / 3.6, pow = 10 ** Math.floor(Math.log10(raw)), max = Math.ceil(raw / pow) * pow * 4, gw = pw / b.categories.length, bw = Math.min(46, (gw - 24) / b.series.length);
  let s = "";
  b.series.forEach((q, i) => { s += rect(px + i * 130, y + 2, 10, 10, { stroke: "none", fill: palette[i], rx: 2 }) + text(px + i * 130 + 15, y + 11, q.label, { size: 10.5 }); });
  for (let t = 0; t <= 4; t++) { const ty = y + top + ph - (t / 4) * ph; s += line(px, ty, px + pw, ty, { dash: t ? "2 3" : null }) + text(px - 5, ty + 3, String(Math.round((max * t) / 4)), { size: 9.5, fill: C.mute, anchor: "end" }); }
  b.categories.forEach((cat, ci) => {
    const g0 = px + ci * gw + (gw - bw * b.series.length) / 2;
    b.series.forEach((q, si) => { const bh = (q.values[ci] / max) * ph; s += rect(g0 + si * bw + 1, y + top + ph - bh, bw - 2, bh, { stroke: "none", fill: palette[si], rx: 2 }) + text(g0 + si * bw + bw / 2, y + top + ph - bh - 4, String(q.values[ci]), { size: 9.5, anchor: "middle", fill: C.mute }); });
    s += text(px + ci * gw + gw / 2, y + top + ph + 14, cat, { size: 10.5, anchor: "middle" });
  });
  s += text(x + w, y + 11, b.unit ?? "", { size: 9.5, fill: C.mute, anchor: "end" });
  return { s, h: top + ph + 20 };
};

function findById(node, id) {
  if (Array.isArray(node)) { for (const n of node) { const f = findById(n, id); if (f) return f; } return null; }
  if (node && typeof node === "object") {
    if (node.id === id) return node;
    for (const v of Object.values(node)) { const f = findById(v, id); if (f) return f; }
  }
  return null;
}

// ---- frame -------------------------------------------------------------
export function renderWireframe(sc) {
  const sample = sc.sample ?? {}, isDecision = sc.tool === "present_decision";
  const step = sc.args.walkthrough && sample.step != null ? sc.args.walkthrough[sample.step] : null;
  // The same two axes as the view: the active state decides what each element is, the spotlight where to look.
  const known = new Set(stateful(sc.args) ? states(sc.args).map((x) => x.id) : []);
  const state = sample.lens ?? (known.has(sample.pick) ? sample.pick : null) ?? step?.state ?? initialState(sc.args);
  const a = applyState(sc.args, state);
  const spot = sample.hover ? { ids: new Set([sample.hover]), strict: false } : step?.focus?.length ? { ids: new Set(step.focus), strict: true } : undefined;
  const ctx = { lens: state, focus: spot?.ids ?? null, hover: sample.hover, fx: { state, spot }, resp: a.response, sample };
  const iw = W - PAD * 2;
  let s = "", y = 0;

  s += `<path d="M0,8 a8,8 0 0 1 8,-8 h${W - 16} a8,8 0 0 1 8,8 v22 h-${W} z" fill="${C.soft}"/>` + line(0, 30, W, 30);
  s += `<circle cx="${PAD}" cy="15" r="4" fill="${isDecision ? C.accent : C.ok}"/>` + text(PAD + 10, 19, sc.tool, { mono: true, size: 11, bold: true }) +
    text(W - PAD, 19, isDecision ? "waits for your answer" : "does not block the agent", { size: 10, fill: C.mute, anchor: "end" });
  y = 54;
  s += text(PAD, y, a.title, { size: 15, bold: true });
  if (a.context) for (const l of wrap(a.context, iw, 11, 2)) { y += 16; s += text(PAD, y, l, { fill: C.mute }); }
  if (a.question) {
    y += 14;
    const ql = wrap(a.question, iw - 16, 12, 2);
    s += rect(PAD, y, 3, ql.length * 16 + 4, { stroke: "none", fill: C.accent, rx: 1 });
    ql.forEach((l, i) => { s += text(PAD + 11, y + 14 + i * 16, l, { size: 12, bold: true }); });
    y += ql.length * 16 + 2;
  }
  if (a.lenses) {
    y += 12;
    let lx = PAD;
    s += text(lx, y + 14, "Lens:", { size: 10, fill: C.mute }); lx += 34;
    for (const l of a.lenses) {
      const on = l.id === ctx.lens, pw = l.label.length * 6.1 + 20;
      s += rect(lx, y, pw, 20, { rx: 10, stroke: on ? C.accent : C.line, fill: on ? C.accent : C.bg }) + text(lx + pw / 2, y + 14, l.label, { size: 10.5, anchor: "middle", fill: on ? "#fff" : C.ink, bold: on });
      lx += pw + 6;
    }
    y += 20;
  }
  y += 16;
  for (const b of a.blocks) {
    if (b.label) { s += text(PAD, y + 10, b.label, { size: 10.5, bold: true, fill: C.mute }); y += 18; }
    const out = B[b.type](b, PAD, y, iw, ctx);
    s += out.s;
    y += out.h + 18;
  }
  if (a.walkthrough) {
    const i = sample.step ?? 0, st = a.walkthrough[i], lines = wrap(st.text, iw - 150, 11, 2), bh = 22 + lines.length * 15;
    s += rect(PAD, y, iw, bh, { fill: C.accentSoft, stroke: C.accent, rx: 6 });
    s += text(PAD + 12, y + 20, `Step ${i + 1} of ${a.walkthrough.length}`, { size: 10.5, bold: true, fill: C.accent });
    lines.forEach((l, k) => { s += text(PAD + 96, y + 20 + k * 15, l, {}); });
    s += rect(W - PAD - 58, y + bh / 2 - 11, 22, 22, { rx: 11 }) + text(W - PAD - 47, y + bh / 2 + 4, "‹", { size: 13, anchor: "middle" }) +
      rect(W - PAD - 30, y + bh / 2 - 11, 22, 22, { rx: 11, fill: C.accent, stroke: C.accent }) + text(W - PAD - 19, y + bh / 2 + 4, "›", { size: 13, anchor: "middle", fill: "#fff" });
    y += bh + 16;
  }
  s += line(0, y, W, y);
  y += 14;
  if (isDecision) {
    const rs = a.response, picks = sample.picks ?? {};
    let primary, secondary = null, summary = sample.summary ?? "";
    if (rs.type === "choose_one") {
      if (Array.isArray(rs.of)) primary = `Confirm ${Object.keys(picks).length} of ${rs.of.length} resolutions`;
      else { const all = a.blocks.flatMap((b) => b.items ?? b.nodes ?? []); const p = all.find((q) => q.id === sample.pick); primary = `Confirm: ${p?.title ?? p?.label ?? "…"}`; secondary = "None of these"; }
    } else if (rs.type === "choose_many") primary = `Confirm selection (${Object.values(picks).filter(Boolean).length})`;
    else if (rs.of) { const v = Object.values(picks); primary = "Submit review"; secondary = "Approve all"; summary ||= `${v.filter((q) => q === "ok").length} approved · ${v.filter((q) => q === "no").length} rejected`; }
    else { primary = "Approve"; secondary = "Reject"; }
    const pw = primary.length * 6.6 + 26, sw = secondary ? secondary.length * 6.4 + 24 : 0;
    const noteW = iw - pw - sw - (secondary ? 20 : 10);
    s += rect(PAD, y, noteW, 30, { rx: 5 }) + text(PAD + 10, y + 19, fit(sample.note ?? "Add a note (optional)", noteW - 20), { fill: sample.note ? C.ink : C.mute });
    if (secondary) s += rect(W - PAD - pw - sw - 10, y, sw, 30, { rx: 5 }) + text(W - PAD - pw - 10 - sw / 2, y + 19, secondary, { anchor: "middle" });
    s += rect(W - PAD - pw, y, pw, 30, { rx: 5, fill: C.accent, stroke: C.accent }) + text(W - PAD - pw / 2, y + 19, primary, { anchor: "middle", fill: "#fff", bold: true });
    y += 30;
    if (summary) { y += 16; s += text(PAD, y, summary, { size: 10.5, fill: C.mute }); }
  } else {
    s += text(PAD, y + 10, "Click any element to ask the agent about it.", { size: 10.5, fill: C.mute });
    y += 12;
  }
  const H = y + 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${r(H)}" width="${W}" font-family="system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif">\n` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${r(H) - 1}" rx="8" fill="${C.bg}" stroke="${C.line}"/>\n${s}\n</svg>\n`;
}
