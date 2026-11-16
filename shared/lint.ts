import type { Block, Decision, View } from "./schema.js";

/** Items of a block the user can answer on, for `response.of`. */
export function answerables(block: Block, depth = 1): { id: string; label: string }[] {
  switch (block.type) {
    case "cards":
      return block.items.map((i) => ({ id: i.id, label: i.title }));
    case "steps":
    case "quadrant":
      return block.items.map(({ id, label }) => ({ id, label }));
    case "matrix":
      return block.rows.map(({ id, label }) => ({ id, label }));
    case "board":
      return block.columns.flatMap((c) => c.items.map(({ id, label }) => ({ id, label })));
    case "graph":
      return block.nodes.map(({ id, label }) => ({ id, label }));
    case "tree": {
      const depthOf = treeDepths(block.nodes);
      return block.nodes.filter((n) => depthOf.get(n.id) === depth).map(({ id, label }) => ({ id, label }));
    }
    default:
      return [];
  }
}

export function treeDepths(nodes: { id: string; parent?: string }[]): Map<string, number> {
  const parent = new Map(nodes.map((n) => [n.id, n.parent]));
  const depth = new Map<string, number>();
  for (const n of nodes) {
    let d = 0;
    let p = n.parent;
    while (p !== undefined && d <= nodes.length) {
      d++;
      p = parent.get(p);
    }
    depth.set(n.id, d);
  }
  return depth;
}

/** Every element id in the view (blocks, lenses). */
export function allIds(view: View): Set<string> {
  const ids = new Set<string>((view.lenses ?? []).map((l) => l.id));
  const add = (x: { id?: string }[]) => x.forEach((e) => e.id && ids.add(e.id));
  for (const b of view.blocks) {
    if (b.type === "cards" || b.type === "steps" || b.type === "quadrant" || b.type === "tradeoff") add(b.items);
    else if (b.type === "graph" || b.type === "tree") add(b.nodes);
    else if (b.type === "matrix") add(b.rows);
    else if (b.type === "board") add(b.columns.flatMap((c) => c.items));
    else if (b.type === "sequence") add(b.messages), add(b.actors);
    else if (b.type === "timeline") add(b.tracks), add(b.tracks.flatMap((t) => t.phases)), add(b.events ?? []);
    else if (b.type === "chart") add(b.series);
  }
  return ids;
}

/**
 * Checks the schema cannot express: references that must resolve.
 * Returned as plain sentences so the model can fix its own call.
 */
export function lint(view: View | Decision): string[] {
  const out: string[] = [];
  const ids = allIds(view);
  view.blocks.forEach((b, i) => {
    const at = `blocks[${i}] (${b.type})`;
    if (b.type === "tradeoff") {
      const items = new Set(b.items.map((x) => x.id));
      const axes = new Set(b.axes.map((x) => x.id));
      for (const s of b.scores) {
        if (!items.has(s.item)) out.push(`${at}: score references unknown item "${s.item}".`);
        if (!axes.has(s.axis)) out.push(`${at}: score references unknown axis "${s.axis}".`);
      }
    } else if (b.type === "graph") {
      const nodes = new Set(b.nodes.map((n) => n.id));
      for (const e of b.edges) for (const end of [e.from, e.to]) if (!nodes.has(end)) out.push(`${at}: edge references unknown node "${end}".`);
      if (b.variant === "commits") {
        const lanes = new Set((b.lanes ?? []).map((l) => l.id));
        if (!lanes.size) out.push(`${at}: the commits variant needs \`lanes\`.`);
        for (const n of b.nodes) if (!n.lane || !lanes.has(n.lane)) out.push(`${at}: node "${n.id}" needs a \`lane\` that exists in \`lanes\`.`);
      }
    } else if (b.type === "tree") {
      const nodes = new Set(b.nodes.map((n) => n.id));
      const roots = b.nodes.filter((n) => n.parent === undefined);
      if (roots.length !== 1) out.push(`${at}: exactly one node must have no \`parent\` (found ${roots.length}).`);
      for (const n of b.nodes) if (n.parent !== undefined && !nodes.has(n.parent)) out.push(`${at}: node "${n.id}" has unknown parent "${n.parent}".`);
    } else if (b.type === "matrix") {
      for (const r of b.rows) if (r.cells.length !== b.columns.length) out.push(`${at}: row "${r.id}" has ${r.cells.length} cells for ${b.columns.length} columns.`);
    } else if (b.type === "sequence") {
      const actors = new Set(b.actors.map((a) => a.id));
      for (const m of b.messages) for (const end of [m.from, m.to]) if (!actors.has(end)) out.push(`${at}: message references unknown actor "${end}".`);
    } else if (b.type === "timeline") {
      const tracks = new Set(b.tracks.map((t) => t.id));
      for (const e of b.events ?? []) if (e.track && !tracks.has(e.track)) out.push(`${at}: event "${e.label}" references unknown track "${e.track}".`);
    } else if (b.type === "chart") {
      for (const s of b.series) if (s.values.length !== b.categories.length) out.push(`${at}: series "${s.id}" has ${s.values.length} values for ${b.categories.length} categories.`);
    }
  });
  (view.walkthrough ?? []).forEach((w, i) => {
    for (const f of w.focus) if (!ids.has(f)) out.push(`walkthrough[${i}]: focus references unknown id "${f}".`);
  });

  if ("response" in view) {
    const { type, of, depth } = view.response;
    const targets = of === undefined ? [] : Array.isArray(of) ? of : [of];
    if (type !== "approve" && targets.length === 0) out.push(`response: \`of\` is required for ${type}.`);
    if (Array.isArray(of) && type !== "choose_one") out.push("response: an array in `of` is only supported for choose_one.");
    for (const t of targets) {
      const block = view.blocks.find((b) => b.id === t);
      if (!block) out.push(`response.of: no block has id "${t}". Give the block an \`id\`.`);
      else if (answerables(block, depth).length === 0) out.push(`response.of: block "${t}" (${block.type}) has no answerable items${block.type === "tree" ? ` at depth ${depth ?? 1}` : ""}.`);
    }
  }
  return out;
}
